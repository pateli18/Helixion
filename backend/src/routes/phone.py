import asyncio
import audioop
import base64
import io
import logging
import wave
from typing import AsyncGenerator, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session
from twilio.rest import Client
from twilio.twiml.voice_response import Connect, VoiceResponse

from src.ai import AiCaller
from src.caller import CallRouter
from src.clinicontact_types import SerializedUUID
from src.db.api import get_phone_call, insert_phone_call
from src.db.base import get_session
from src.settings import settings

call_messages: dict[SerializedUUID, dict[str, asyncio.Queue[str]]] = {}
twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/phone",
    tags=["phone"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


@router.post("/incoming-call")
async def handle_incoming_call(request: Request):
    response = VoiceResponse()
    connect = Connect()
    connect.stream(url=f"wss://{settings.host}/media-stream")
    response.append(connect)
    return HTMLResponse(content=str(response), media_type="application/xml")


class OutboundCallRequest(BaseModel):
    phone_number: str
    user_info: dict


class OutboundCallResponse(BaseModel):
    phone_call_id: SerializedUUID


@router.post("/outbound-call", response_model=OutboundCallResponse)
async def outbound_call(
    request: OutboundCallRequest,
    db: async_scoped_session = Depends(get_session),
):
    phone_call_id = uuid4()
    call = twilio_client.calls.create(
        to=request.phone_number,
        from_="+16282385962",
        twiml=f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://{settings.host}/api/v1/phone/outbound-call-stream/{phone_call_id}" /></Connect></Response>',
    )

    await insert_phone_call(
        phone_call_id,
        cast(str, call.sid),
        request.user_info,
        db,
    )
    await db.commit()

    # initialize queues for this call
    call_messages[phone_call_id] = {
        "speaker_queue": asyncio.Queue(),
        "audio_queue": asyncio.Queue(),
    }

    return OutboundCallResponse(phone_call_id=phone_call_id)


@router.websocket("/outbound-call-stream/{phone_call_id}")
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
        cast(dict, phone_call.input_data),
        phone_call_id,
        call_messages[phone_call_id],
    ) as ai:
        call_router = CallRouter(ai)
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )


@router.get("/stream-audio/{phone_call_id}")
async def stream_audio(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")

    async def audio_stream(phone_call_id: SerializedUUID):
        # Create WAV header using wave module
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # mono
            wav_file.setsampwidth(2)  # 2 bytes per sample (16-bit)
            wav_file.setframerate(8000)  # 8kHz for G.711
            # We don't write any frames yet, just creating the header

        # Send the header first
        yield wav_buffer.getvalue()

        audio_queue = call_messages[phone_call_id]["audio_queue"]
        while True:
            event_data = await audio_queue.get()
            if event_data == "END":
                break
            pcm_data = base64.b64decode(event_data)
            pcm_16bit = audioop.ulaw2lin(pcm_data, 2)
            yield pcm_16bit

    return StreamingResponse(
        audio_stream(phone_call_id), media_type="audio/wav"
    )


@router.get("/stream-speaker/{phone_call_id}")
async def stream_speaker(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")

    async def speaker_stream(
        phone_call_id: SerializedUUID,
    ) -> AsyncGenerator[str, None]:
        speaker_queue = call_messages[phone_call_id]["speaker_queue"]
        while True:
            event_data = await speaker_queue.get()
            if event_data == "END":
                break
            yield event_data

    return StreamingResponse(
        speaker_stream(phone_call_id), media_type="application/json"
    )
