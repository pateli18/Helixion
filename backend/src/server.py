import asyncio
import json
import logging

import httpx
from fastapi import BackgroundTasks, FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from twilio.twiml.voice_response import Connect, VoiceResponse

from src.ai import (
    MODEL,
    AiCaller,
    AiSessionConfiguration,
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    ResponseType,
    S3Client,
    format_user_info,
    send_openai_request,
)
from src.caller import CallRouter
from src.settings import settings, setup_logging

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()

origins = ["https://clinicontact-frontend.onrender.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/incoming-call")
async def handle_incoming_call(request: Request):
    response = VoiceResponse()
    response.say("O.K. you can start talking!")
    host = request.url.hostname
    connect = Connect()
    connect.stream(url=f"wss://{host}/media-stream")
    response.append(connect)
    return HTMLResponse(content=str(response), media_type="application/xml")


@app.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    await websocket.accept()
    async with AiCaller(
        {
            "name": "John Doe",
            "email": "john.doe@example.com",
        }
    ) as ai:
        call_router = CallRouter(ai)
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )


class CreateSessionResponse(BaseModel):
    id: str
    value: str
    expires_at: int


@app.post("/api/v1/create-session", response_model=CreateSessionResponse)
async def create_session(payload: dict) -> CreateSessionResponse:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
            },
            json={
                "model": MODEL,
                **AiSessionConfiguration.default(payload).model_dump(),
            },
        )
        logger.info(response.text)
        response.raise_for_status()
        output = response.json()
    return CreateSessionResponse(**output["client_secret"], id=output["id"])


class StoreSessionRequest(BaseModel):
    session_id: str
    data: list[dict]
    original_user_info: dict


async def _upload_session_data(session_id: str, data: list[dict]):
    async with S3Client() as s3_client:
        await s3_client.upload_file(
            json.dumps(data).encode("utf-8"),
            f"s3://clinicontact/sessions/{session_id}.json",
            "application/json",
        )


@app.post("/api/v1/store-session")
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
