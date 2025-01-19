import asyncio
import audioop
import io
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

from src.ai.caller import AiCaller, AiMessage, AiMessageQueue
from src.audio.audio_router import CallRouter
from src.audio.data_processing import calculate_bar_heights, process_audio_data
from src.aws_utils import S3Client
from src.db.api import (
    get_phone_call,
    get_phone_calls,
    insert_phone_call,
    insert_phone_call_event,
)
from src.db.base import get_session
from src.db.converter import convert_phone_call_model
from src.helixion_types import (
    BROWSER_NAME,
    AiMessageEventTypes,
    BarHeight,
    PhoneCallMetadata,
    SerializedUUID,
    SpeakerSegment,
)
from src.settings import settings

call_messages: dict[SerializedUUID, AiMessageQueue] = {}
twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
twilio_request_validator = RequestValidator(settings.twilio_auth_token)
audio_cache_lock = asyncio.Lock()
audio_cache: LRUCache[
    SerializedUUID,
    tuple[list[SpeakerSegment], bytes, list[BarHeight], int],
] = LRUCache(maxsize=50)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/phone",
    tags=["phone"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


async def _validate_twilio_request(request: Request) -> dict:
    signature = request.headers.get("X-Twilio-Signature")
    if not signature:
        raise HTTPException(status_code=403, detail="Missing Twilio signature")
    scheme = request.headers.get(
        "X-Forwarded-Proto", "http"
    )  # Default to 'http' if header is absent
    host = request.headers.get("X-Forwarded-Host", request.url.hostname)
    full_url = f"{scheme}://{host}{request.url.path}"

    form_data = await request.form()
    if not twilio_request_validator.validate(full_url, form_data, signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio request")

    return dict(form_data)


class OutboundCallRequest(BaseModel):
    phone_number: str
    user_info: dict
    agent_id: SerializedUUID


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
        request.agent_id,
        db,
    )
    await db.commit()

    # initialize queues for this call
    call_messages[phone_call_id] = AiMessageQueue()

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
        user_info=cast(dict, phone_call.input_data),
        system_prompt=phone_call.agent.system_message,
        phone_call_id=phone_call_id,
        audio_format="g711_ulaw",
        start_speaking_buffer_ms=500,
    ) as ai:
        ai.attach_queue(call_messages[phone_call_id])
        call_router = CallRouter(ai)
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )


@router.get("/listen-in-stream/{phone_call_id}")
async def listen_in(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    logger.info(f"Listening in for phone call {phone_call_id}")

    async def listen_in_stream(
        phone_call_id: SerializedUUID,
    ) -> AsyncGenerator[str, None]:
        queue = call_messages[phone_call_id].queue
        while True:
            message = await queue.get()
            yield message.serialized
            if message.type == AiMessageEventTypes.call_end:
                break

    return StreamingResponse(
        listen_in_stream(phone_call_id), media_type="application/x-ndjson"
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
    if phone_call_id in call_messages:
        call_messages[phone_call_id].queue.put_nowait(
            AiMessage(
                type=AiMessageEventTypes.call_end, data=None, metadata={}
            )
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
) -> tuple[list[SpeakerSegment], bytes, list[BarHeight], int]:
    data = audio_cache.get(phone_call_id)
    if data is None:
        phone_call = await get_phone_call(phone_call_id, db)
        if phone_call is None:
            raise HTTPException(status_code=404, detail="Phone call not found")
        async with S3Client() as s3:
            audio_data_raw, _, _ = await s3.download_file(
                cast(str, phone_call.call_data)
            )
        sample_rate = (
            8000
            if cast(str, phone_call.from_phone_number) != BROWSER_NAME
            else 24000
        )
        speaker_segments, audio_data = process_audio_data(
            audio_data_raw, sample_rate
        )
        if sample_rate == 8000:
            audio_data = audioop.ulaw2lin(audio_data, 2)
        bar_heights = calculate_bar_heights(
            audio_data, 50, speaker_segments, sample_rate
        )
        async with audio_cache_lock:
            audio_cache[phone_call_id] = (
                speaker_segments,
                audio_data,
                bar_heights,
                sample_rate,
            )
    else:
        speaker_segments, audio_data, bar_heights, sample_rate = data
    return speaker_segments, audio_data, bar_heights, sample_rate


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
    speaker_segments, pcm_data, bar_heights, sample_rate = (
        await _process_audio_data(phone_call_id, db)
    )
    return AudioTranscriptResponse(
        speaker_segments=speaker_segments,
        bar_heights=bar_heights,
        total_duration=len(pcm_data) / 2 / sample_rate,
    )


@router.get("/play-audio/{phone_call_id}")
async def play_audio(
    phone_call_id: SerializedUUID,
    request: Request,
    db: async_scoped_session = Depends(get_session),
):
    _, audio_data, _, sample_rate = await _process_audio_data(
        phone_call_id, db
    )

    # Create WAV header
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
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
