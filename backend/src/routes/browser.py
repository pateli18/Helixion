import asyncio
import logging
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.caller import AiCaller
from src.audio.audio_router import BrowserRouter
from src.auth import User, require_user
from src.db.api import (
    check_organization_owns_agent,
    get_phone_call,
    insert_phone_call,
    insert_phone_call_event,
)
from src.db.base import get_session
from src.db.converter import convert_phone_call_model
from src.helixion_types import (
    BROWSER_NAME,
    PhoneCallStatus,
    PhoneCallType,
    SerializedUUID,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/browser",
    tags=["browser"],
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
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
):
    if not await check_organization_owns_agent(
        request.agent_id, cast(str, user.active_org_id), db
    ):
        raise HTTPException(status_code=403, detail="Agent not found")
    phone_call_id = uuid4()
    from_phone_number = BROWSER_NAME

    await insert_phone_call(
        phone_call_id,
        user.email,
        "no-sid",
        request.user_info,
        from_phone_number,
        BROWSER_NAME,
        request.agent_id,
        PhoneCallType.outbound,
        cast(str, user.active_org_id),
        db,
    )
    await insert_phone_call_event(
        phone_call_id,
        {
            "CallDuration": 0,
            "CallStatus": PhoneCallStatus.queued,
            "SequenceNumber": 0,
        },
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
    phone_call_model = await get_phone_call(phone_call_id, db)
    if phone_call_model is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    phone_call = convert_phone_call_model(phone_call_model)
    if phone_call.status != PhoneCallStatus.queued:
        raise HTTPException(status_code=400, detail="Phone call not queued")

    await websocket.accept()
    async with AiCaller(
        user_info=phone_call.input_data,
        system_prompt=phone_call_model.agent.system_message,
        phone_call_id=phone_call_id,
        audio_format="pcm16",
        start_speaking_buffer_ms=500,
        tool_configuration=phone_call_model.agent.tool_configuration,
    ) as ai:
        call_router = BrowserRouter(
            agent_id=phone_call_model.agent.id,
            organization_id=cast(str, phone_call_model.organization_id),
            ai_caller=ai,
        )
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )
