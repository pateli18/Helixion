import asyncio
import logging
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.caller import AiCaller
from src.audio.audio_router import BrowserRouter
from src.db.api import get_phone_call, insert_phone_call
from src.db.base import get_session
from src.helixion_types import BROWSER_NAME, SerializedUUID

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/browser",
    tags=["browser"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


class CallRequest(BaseModel):
    user_info: dict
    agent_id: SerializedUUID


class CallResponse(BaseModel):
    phone_call_id: SerializedUUID


@router.post("/call", response_model=CallResponse)
async def outbound_call(
    request: CallRequest,
    db: async_scoped_session = Depends(get_session),
):
    phone_call_id = uuid4()
    from_phone_number = BROWSER_NAME

    await insert_phone_call(
        phone_call_id,
        "no-sid",
        request.user_info,
        from_phone_number,
        BROWSER_NAME,
        request.agent_id,
        db,
    )
    await db.commit()

    return CallResponse(phone_call_id=phone_call_id)


@router.websocket("/call-stream/{phone_call_id}")
async def call_stream(
    phone_call_id: SerializedUUID,
    websocket: WebSocket,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    await websocket.accept()
    async with AiCaller(
        user_info=cast(dict, phone_call.input_data),
        system_prompt=phone_call.agent.system_message,
        phone_call_id=phone_call_id,
        audio_format="pcm16",
    ) as ai:
        call_router = BrowserRouter(ai)
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )
