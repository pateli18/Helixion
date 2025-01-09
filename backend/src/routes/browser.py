import json
import logging

import httpx
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from src.ai import (
    AiSessionConfiguration,
    S3Client,
    format_user_info,
    send_openai_request,
)
from src.clinicontact_types import (
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    ResponseType,
)
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
                **AiSessionConfiguration.default(payload).model_dump(),
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
            f"s3://clinicontact/sessions/{session_id}.json",
            "application/json",
        )


class StoreSessionRequest(BaseModel):
    session_id: str
    data: list[dict]
    original_user_info: dict


@router.post("/api/v1/store-session")
async def store_session(
    request: StoreSessionRequest, background_tasks: BackgroundTasks
):
    background_tasks.add_task(
        _upload_session_data,
        request.session_id,
        request.data,
    )

    relevant_lines = "\n----------\n".join(
        line["transcript"]
        for line in request.data
        if line["type"]
        in [
            "conversation.item.input_audio_transcription.completed",
            "response.audio_transcript.done",
        ]
    )

    user_info_fmt = format_user_info(request.original_user_info)
    system_prompt = f"""
- You are a helpful assistant.
- The user originally provided the following information:
{user_info_fmt}
- You are given the transcript of a call between the user and an assistant confirming the information provided by the user.
- Based on the transcript, provide the final user information as a JSON object. The keys should be the same as the original user information, but the values may be different depending on the transcript.
"""
    chat = OpenAiChatInput(
        messages=[
            ModelChat(
                role=ModelChatType.system,
                content=system_prompt,
            ),
            ModelChat(
                role=ModelChatType.user,
                content=relevant_lines,
            ),
        ],
        model=ModelType.gpt4o,
        response_format=ResponseType(),
    )
    response = await send_openai_request(chat.data, "chat/completions")
    output = json.loads(response["choices"][0]["message"]["content"])
    return output
