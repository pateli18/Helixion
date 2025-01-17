import json
import logging
from typing import cast

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.caller import AiSessionConfiguration
from src.aws_utils import S3Client
from src.db.api import get_agent
from src.db.base import get_session
from src.helixion_types import ModelType, SerializedUUID
from src.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/browser",
    tags=["browser"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


class CreateSessionRequest(BaseModel):
    user_info: dict
    agent_id: SerializedUUID


class CreateSessionResponse(BaseModel):
    id: str
    value: str
    expires_at: int


@router.post("/create-session", response_model=CreateSessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db: async_scoped_session = Depends(get_session),
) -> CreateSessionResponse:
    agent = await get_agent(request.agent_id, db)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
            },
            json={
                "model": ModelType.realtime.value,
                **AiSessionConfiguration.default(
                    cast(str, agent.system_message),
                    request.user_info,
                    "pcm16",
                    True,
                ).model_dump(),
            },
        )
        response.raise_for_status()
        output = response.json()
    return CreateSessionResponse(**output["client_secret"], id=output["id"])


async def _upload_session_data(session_id: str, data: list[dict]):
    async with S3Client() as s3_client:
        await s3_client.upload_file(
            json.dumps(data).encode("utf-8"),
            f"s3://clinicontact/browser/sessions/{session_id}.json",
            "application/json",
        )


class StoreSessionRequest(BaseModel):
    session_id: str
    data: list[dict]
    original_user_info: dict


@router.post("/store-session")
async def store_session(
    request: StoreSessionRequest, background_tasks: BackgroundTasks
):
    background_tasks.add_task(
        _upload_session_data,
        request.session_id,
        request.data,
    )
    return Response(status_code=204)
