import asyncio
import audioop
import base64
import io
import json
import logging
import wave
from typing import AsyncGenerator, cast
from uuid import uuid4

from cachetools import LRUCache
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    WebSocket,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session
from twilio.request_validator import RequestValidator
from twilio.rest import Client

from src.ai import AiCaller
from src.audio.data_processing import calculate_bar_heights, process_audio_data
from src.aws_utils import S3Client
from src.caller import CallRouter
from src.clinicontact_types import (
    BarHeight,
    PhoneCallMetadata,
    SerializedUUID,
    SpeakerSegment,
)
from src.db.api import (
    get_phone_call,
    get_phone_calls,
    insert_phone_call,
    insert_phone_call_event,
)
from src.db.base import get_session
from src.db.converter import convert_phone_call_model
from src.settings import settings

call_messages: dict[SerializedUUID, dict[str, asyncio.Queue[str]]] = {}
twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
twilio_request_validator = RequestValidator(settings.twilio_auth_token)
audio_cache_lock = asyncio.Lock()
audio_cache: LRUCache[
    SerializedUUID,
    tuple[list[SpeakerSegment], bytes, list[BarHeight]],
] = LRUCache(maxsize=50)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/phone",
    tags=["phone"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


async def _validate_twilio_request(request: Request):
    signature = request.headers.get("X-Twilio-Signature")
    if not signature:
        raise HTTPException(status_code=403, detail="Missing Twilio signature")
    body = await request.body()
    body_json = json.loads(body)
    if not twilio_request_validator.validate(
        request.url, body_json, signature
    ):
        raise HTTPException(status_code=403, detail="Invalid Twilio request")
    return body_json


class OutboundCallRequest(BaseModel):
    phone_number: str
    user_info: dict


class OutboundCallResponse(BaseModel):
    phone_call_id: SerializedUUID


@router.post("/webhook/status/{phone_call_id}", status_code=204)
async def status_webhook(
    phone_call_id: SerializedUUID,
    payload: dict = Depends(_validate_twilio_request),
    db: async_scoped_session = Depends(get_session),
):
    await insert_phone_call_event(phone_call_id, payload, db)
    await db.commit()

    return Response(status_code=204)


@router.post("/outbound-call", response_model=OutboundCallResponse)
async def outbound_call(
    request: OutboundCallRequest,
    db: async_scoped_session = Depends(get_session),
):
    phone_call_id = uuid4()
    from_phone_number = "+16282385962"
    call = twilio_client.calls.create(
        to=request.phone_number,
        from_=from_phone_number,
        twiml=f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://{settings.host}/api/v1/phone/outbound-call-stream/{phone_call_id}" /></Connect></Response>',
        status_callback=f"https://{settings.host}/api/v1/phone/webhook/status/{phone_call_id}",
        status_callback_event=[
            "initiated",
            "ringing",
            "answered",
            "completed",
        ],
    )

    await insert_phone_call(
        phone_call_id,
        cast(str, call.sid),
        request.user_info,
        from_phone_number,
        request.phone_number,
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
    logger.info(f"Streaming audio for phone call {phone_call_id}")

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

        audio_buffer = bytearray()
        audio_queue = call_messages[phone_call_id]["audio_queue"]
        while True:
            event_data = await audio_queue.get()
            if event_data == "END":
                yield bytes(audio_buffer)
                break
            pcm_data = base64.b64decode(event_data)
            pcm_16bit = audioop.ulaw2lin(pcm_data, 2)
            audio_buffer.extend(pcm_16bit)

            if len(audio_buffer) > 8000:
                yield bytes(audio_buffer)
                audio_buffer = bytearray()

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
            yield event_data + "\n"

    return StreamingResponse(
        speaker_stream(phone_call_id), media_type="application/x-ndjson"
    )


@router.post("/hang-up/{phone_call_id}", status_code=204)
async def hang_up(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    if phone_call.call_data is not None:
        raise HTTPException(status_code=400, detail="Phone call already ended")
    twilio_client.calls(cast(str, phone_call.call_sid)).update(
        status="completed"
    )
    return Response(status_code=204)


@router.get("/call-history", response_model=list[PhoneCallMetadata])
async def get_call_history(
    db: async_scoped_session = Depends(get_session),
) -> list[PhoneCallMetadata]:
    phone_calls = await get_phone_calls(db)
    return [convert_phone_call_model(phone_call) for phone_call in phone_calls]


async def _process_audio_data(
    phone_call_id: SerializedUUID,
    db: async_scoped_session,
) -> tuple[list[SpeakerSegment], bytes, list[BarHeight]]:
    data = audio_cache.get(phone_call_id)
    if data is None:
        phone_call = await get_phone_call(phone_call_id, db)
        if phone_call is None:
            raise HTTPException(status_code=404, detail="Phone call not found")
        async with S3Client() as s3:
            audio_data_raw, _, _ = await s3.download_file(
                cast(str, phone_call.call_data)
            )
        speaker_segments, audio_data = process_audio_data(audio_data_raw)
        pcm_data = audioop.ulaw2lin(audio_data, 2)
        bar_heights = calculate_bar_heights(pcm_data, 50, speaker_segments)
        async with audio_cache_lock:
            audio_cache[phone_call_id] = (
                speaker_segments,
                pcm_data,
                bar_heights,
            )
    else:
        speaker_segments, pcm_data, bar_heights = data
    return speaker_segments, pcm_data, bar_heights


class AudioTranscriptResponse(BaseModel):
    speaker_segments: list[SpeakerSegment]
    bar_heights: list[BarHeight]
    total_duration: float


@router.get(
    "/audio-transcript/{phone_call_id}", response_model=AudioTranscriptResponse
)
async def get_audio_transcript(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    speaker_segments, pcm_data, bar_heights = await _process_audio_data(
        phone_call_id, db
    )
    return AudioTranscriptResponse(
        speaker_segments=speaker_segments,
        bar_heights=bar_heights,
        total_duration=len(pcm_data) / 2 / 8000,
    )


@router.get("/play-audio/{phone_call_id}")
async def play_audio(
    phone_call_id: SerializedUUID,
    request: Request,
    db: async_scoped_session = Depends(get_session),
):
    _, audio_data, _ = await _process_audio_data(phone_call_id, db)

    # Create WAV header
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8000)
        wav_file.writeframes(audio_data)

    full_audio = wav_buffer.getvalue()
    total_size = len(full_audio)

    # Handle range request
    range_header = request.headers.get("range")

    if range_header:
        try:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else total_size - 1
        except (IndexError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid range header")

        if start >= total_size or end >= total_size:
            raise HTTPException(
                status_code=416, detail="Requested range not satisfiable"
            )

        chunk_size = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{total_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": "audio/wav",
            "Content-Disposition": f"attachment; filename={phone_call_id}.wav",
        }
        return Response(
            full_audio[start : end + 1], status_code=206, headers=headers
        )

    # Return full audio if no range header
    return Response(
        full_audio,
        media_type="audio/wav",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total_size),
            "Content-Disposition": f"attachment; filename={phone_call_id}.wav",
        },
    )
