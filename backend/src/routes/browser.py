import json
import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, Response
from pydantic import BaseModel

from src.ai import AiSessionConfiguration, S3Client
from src.helixion_types import ModelType
from src.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/browser",
    tags=["browser"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


class CreateSessionResponse(BaseModel):
    id: str
    value: str
    expires_at: int


@router.post("/create-session", response_model=CreateSessionResponse)
async def create_session(payload: dict) -> CreateSessionResponse:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
            },
            json={
                "model": ModelType.realtime.value,
                **AiSessionConfiguration.default(
                    payload, "pcm16"
                ).model_dump(),
            },
        )
        logger.info(response.text)
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
