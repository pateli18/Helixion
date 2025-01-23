import asyncio
import audioop
import base64
import io
import logging
import wave
from typing import AsyncGenerator, cast
from uuid import uuid4

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

from src.ai.caller import AiCaller, AiMessageQueue
from src.audio.audio_router import (
    CallRouter,
    hang_up_phone_call,
    twilio_client,
    twilio_request_validator,
)
from src.audio.data_processing import calculate_bar_heights, process_audio_data
from src.auth import auth
from src.aws_utils import S3Client
from src.db.api import (
    get_agent_documents,
    get_phone_call,
    get_phone_calls,
    insert_phone_call,
    insert_phone_call_event,
)
from src.db.base import get_session
from src.db.converter import convert_phone_call_model, latest_phone_call_event
from src.helixion_types import (
    BROWSER_NAME,
    AiMessageEventTypes,
    BarHeight,
    Document,
    PhoneCallMetadata,
    PhoneCallStatus,
    SerializedUUID,
    SpeakerSegment,
)
from src.settings import settings

call_messages: dict[SerializedUUID, AiMessageQueue] = {}

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/phone",
    tags=["phone"],
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

    # end live streams with terminal states
    if (
        payload["CallStatus"]
        in [
            PhoneCallStatus.completed,
            PhoneCallStatus.busy,
            PhoneCallStatus.failed,
            PhoneCallStatus.no_answer,
        ]
        and phone_call_id in call_messages
    ):
        call_messages[phone_call_id].end_call()

    return Response(status_code=204)


@router.post(
    "/outbound-call",
    response_model=OutboundCallResponse,
    dependencies=[Depends(auth.require_user)],
)
async def outbound_call(
    request: OutboundCallRequest,
    db: async_scoped_session = Depends(get_session),
):
    phone_call_id = uuid4()
    from_phone_number = "+13305787677"
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
    event_payload = latest_phone_call_event(phone_call)
    if (
        event_payload is not None
        and event_payload["CallStatus"] != PhoneCallStatus.queued
    ):
        raise HTTPException(status_code=400, detail="Phone call not queued")

    document_models = await get_agent_documents(phone_call.agent.base_id, db)
    documents = [
        Document.model_validate(document_model)
        for document_model in document_models
    ]

    async with AiCaller(
        user_info=cast(dict, phone_call.input_data),
        system_prompt=phone_call.agent.system_message,
        phone_call_id=phone_call_id,
        audio_format="g711_ulaw",
        start_speaking_buffer_ms=500,
        documents=documents,
    ) as ai:
        ai.attach_queue(call_messages[phone_call_id])
        call_router = CallRouter(cast(str, phone_call.call_sid), ai)
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )


@router.get(
    "/listen-in-stream/{phone_call_id}",
    dependencies=[Depends(auth.require_user)],
)
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


@router.post(
    "/hang-up/{phone_call_id}",
    status_code=204,
    dependencies=[Depends(auth.require_user)],
)
async def hang_up(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    if phone_call.call_data is not None:
        raise HTTPException(status_code=400, detail="Phone call already ended")
    hang_up_phone_call(cast(str, phone_call.call_sid))
    if phone_call_id in call_messages:
        call_messages[phone_call_id].end_call()
    return Response(status_code=204)


@router.get(
    "/call-history",
    response_model=list[PhoneCallMetadata],
    dependencies=[Depends(auth.require_user)],
)
async def get_call_history(
    db: async_scoped_session = Depends(get_session),
) -> list[PhoneCallMetadata]:
    phone_calls = await get_phone_calls(db)
    return [convert_phone_call_model(phone_call) for phone_call in phone_calls]


class AudioTranscriptResponse(BaseModel):
    speaker_segments: list[SpeakerSegment]
    bar_heights: list[BarHeight]
    total_duration: float
    audio_data_b64: str


@router.get(
    "/playback/{phone_call_id}",
    response_model=AudioTranscriptResponse,
    dependencies=[Depends(auth.require_user)],
)
async def get_audio_playback(
    phone_call_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    async with S3Client() as s3:
        audio_data_raw, _, _ = await s3.download_file(
            cast(str, phone_call.call_data)
        )
    (sample_rate) = (
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

    # conver audio to wav and then b64
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data)
    audio_data_b64 = base64.b64encode(wav_buffer.getvalue()).decode("utf-8")
    return AudioTranscriptResponse(
        speaker_segments=speaker_segments,
        bar_heights=bar_heights,
        total_duration=len(audio_data) / 2 / sample_rate,
        audio_data_b64=audio_data_b64,
    )
