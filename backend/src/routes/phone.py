import asyncio
import audioop
import base64
import io
import json
import logging
import random
import zipfile
from typing import AsyncGenerator, Optional, cast
from uuid import uuid4

import librosa
import numpy as np
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    WebSocket,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session
from twilio.twiml.voice_response import Connect, VoiceResponse

from src.ai.caller import AiCaller, AiMessage, AiMessageQueue
from src.ai.signup_verification import signup_verification_status_prompt
from src.audio.audio_router import CallRouter
from src.audio.data_processing import (
    calculate_bar_heights,
    pcm_to_wav_buffer,
    process_audio_data,
)
from src.audio.sounds import get_sound_base64
from src.auth import User, require_user
from src.aws_utils import S3Client
from src.db.api import (
    check_organization_owns_agent,
    get_agent,
    get_agent_workflow_by_phone_number,
    get_phone_call,
    get_phone_calls,
    get_phone_number,
    get_text_messages_from_workflow,
    insert_agent_workflow_event,
    insert_phone_call,
    insert_phone_call_event,
    insert_text_message,
    insert_text_message_event,
    update_agent_workflow_status,
    update_phone_call,
)
from src.db.base import async_session_scope, get_session
from src.db.converter import (
    convert_agent_phone_number,
    convert_phone_call_model,
    convert_text_message_model,
    latest_phone_call_event,
)
from src.helixion_types import (
    BROWSER_NAME,
    DEFAULT_PHONE_NUMBER,
    TERMINAL_PHONE_CALL_STATUSES,
    AgentWorkflowEventType,
    AgentWorkflowStatus,
    AiMessageEventTypes,
    BarHeight,
    PhoneCallEndReason,
    PhoneCallMetadata,
    PhoneCallStatus,
    PhoneCallType,
    SerializedUUID,
    Speaker,
    SpeakerSegment,
    TextMessageType,
)
from src.settings import settings
from src.twilio_utils import (
    create_call,
    hang_up_phone_call,
    send_text_message,
    twilio_request_validator,
)
from src.worker.worker_client.worker_client import cancel_workflow

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
    outbound_phone_number_id: Optional[SerializedUUID] = None


class OutboundCallResponse(BaseModel):
    phone_call_id: SerializedUUID


@router.post("/webhook/call-status/{phone_call_id}", status_code=204)
async def call_status_webhook(
    phone_call_id: SerializedUUID,
    payload: dict = Depends(_validate_twilio_request),
    db: async_scoped_session = Depends(get_session),
):
    await insert_phone_call_event(phone_call_id, payload, db)
    await db.commit()

    # end live streams with terminal states
    if (
        payload.get("CallStatus") in TERMINAL_PHONE_CALL_STATUSES
        and phone_call_id in call_messages
    ):
        call_messages[phone_call_id].end_call()

    return Response(status_code=204)


@router.post("/webhook/text-message-status/{text_message_id}", status_code=204)
async def text_message_status_webhook(
    text_message_id: SerializedUUID,
    payload: dict = Depends(_validate_twilio_request),
    db: async_scoped_session = Depends(get_session),
):
    await insert_text_message_event(text_message_id, payload, db)
    await db.commit()
    return Response(status_code=204)


async def _handle_workflow_inbound_message(
    from_phone_number: str,
    to_phone_number: str,
    text_message_id: SerializedUUID,
    organization_id: str,
):
    async with async_session_scope() as db:
        # check if from phone number is associated with a verification workflow
        agent_workflow = await get_agent_workflow_by_phone_number(
            from_phone_number, organization_id, db
        )
        if agent_workflow is not None:
            await insert_agent_workflow_event(
                agent_workflow_id=cast(SerializedUUID, agent_workflow.id),
                event_type=AgentWorkflowEventType.inbound_text_message,
                event_link_id=text_message_id,
                metadata={},
                db=db,
            )

            existing_text_message_models = (
                await get_text_messages_from_workflow(
                    cast(SerializedUUID, agent_workflow.id), db
                )
            )
            existing_text_messages = [
                convert_text_message_model(text_message)
                for text_message in existing_text_message_models
            ]

            status = await signup_verification_status_prompt(
                existing_text_messages
            )
            if status == "verified":
                response_message = "Thank you for confirming, a member of the study team will be in touch shortly."
                await update_agent_workflow_status(
                    cast(SerializedUUID, agent_workflow.id),
                    AgentWorkflowStatus.completed,
                    db,
                )
                await cancel_workflow(str(agent_workflow.id))
            elif status == "not_interested":
                response_message = "Thank you for your response, we will not contact you further."
                await update_agent_workflow_status(
                    cast(SerializedUUID, agent_workflow.id),
                    AgentWorkflowStatus.completed,
                    db,
                )
                await cancel_workflow(str(agent_workflow.id))
            else:
                response_message = "We're sorry but we can't answer that, if you're still interested in joining the study let us know and a member of the study team will be in touch shortly. If you're no longer interested, please let us know and we will remove you from the list."

            output_sid = send_text_message(
                to_phone_number=from_phone_number,
                body=response_message,
                from_phone_number=to_phone_number,
                status_callback=f"https://{settings.host}/api/v1/phone/webhook/text-message-status/{text_message_id}",
            )

            outbound_text_message_id = await insert_text_message(
                agent_id=None,
                from_phone_number=to_phone_number,
                to_phone_number=from_phone_number,
                body=response_message,
                message_type=TextMessageType.outbound,
                message_sid=output_sid,
                initiator="workflow",
                organization_id=organization_id,
                db=db,
            )

            await insert_agent_workflow_event(
                agent_workflow_id=cast(SerializedUUID, agent_workflow.id),
                event_type=AgentWorkflowEventType.outbound_text_message,
                event_link_id=outbound_text_message_id,
                metadata={"status": status},
                db=db,
            )


@router.post(
    "/inbound-message/{phone_number_id}",
    status_code=204,
)
async def inbound_message(
    phone_number_id: SerializedUUID,
    background_tasks: BackgroundTasks,
    payload: dict = Depends(_validate_twilio_request),
    db: async_scoped_session = Depends(get_session),
):
    phone_number = await get_phone_number(phone_number_id, db)
    to_number = payload["To"]
    if phone_number is None or phone_number.phone_number != to_number:
        logger.exception(
            f"Phone number not found for phone number {phone_number_id}"
        )
        return Response(status_code=204)

    organization_id = cast(str, phone_number.organization_id)
    from_phone_number = payload["From"]

    text_message_id = await insert_text_message(
        (
            cast(SerializedUUID, phone_number.agent.id)
            if phone_number.agent is not None
            else None
        ),
        from_phone_number,
        to_number,
        payload["Body"],
        TextMessageType.inbound,
        payload["MessageSid"],
        "texter",
        cast(str, phone_number.organization_id),
        db,
    )
    await db.commit()

    background_tasks.add_task(
        _handle_workflow_inbound_message,
        from_phone_number,
        to_number,
        text_message_id,
        organization_id,
    )

    return Response(status_code=204)


@router.post("/inbound-call/{phone_number_id}")
async def inbound_call(
    phone_number_id: SerializedUUID,
    payload: dict = Depends(_validate_twilio_request),
    db: async_scoped_session = Depends(get_session),
):
    phone_number = await get_phone_number(phone_number_id, db)
    to_number = payload["To"]
    if phone_number is None or phone_number.phone_number != to_number:
        raise HTTPException(status_code=404, detail="Phone number not found")
    voice_response = VoiceResponse()
    if phone_number.agent is None:
        voice_response.say(
            "We're sorry, but this number only makes outbound calls. Goodbye!"
        )
        voice_response.hangup()
    else:
        phone_call_id = uuid4()
        await insert_phone_call(
            phone_call_id,
            "caller",
            payload["CallSid"],
            {},
            payload["From"],
            to_number,
            cast(SerializedUUID, phone_number.agent.id),
            PhoneCallType.inbound,
            cast(str, phone_number.organization_id),
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

        # initialize queues for this call
        call_messages[phone_call_id] = AiMessageQueue()

        connect = Connect()
        connect.stream(
            url=f"wss://{settings.host}/api/v1/phone/call-stream/{phone_call_id}",
            status_callback=f"https://{settings.host}/api/v1/phone/webhook/call-status/{phone_call_id}",
            status_callback_event=[
                "initiated",
                "ringing",
                "answered",
                "completed",
            ],
        )
        voice_response.append(connect)
    return Response(content=str(voice_response), media_type="application/xml")


@router.post(
    "/outbound-call",
    response_model=OutboundCallResponse,
)
async def outbound_call(
    request: OutboundCallRequest,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> OutboundCallResponse:
    agent_model = await get_agent(request.agent_id, db)
    if agent_model is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if cast(str, agent_model.organization_id) != user.active_org_id:
        raise HTTPException(status_code=403, detail="Agent not found")

    agent_phone_numbers = [
        convert_agent_phone_number(item) for item in agent_model.phone_numbers
    ]
    if request.outbound_phone_number_id is not None:
        matching_phone_numbers = [
            item
            for item in agent_phone_numbers
            if item.id == request.outbound_phone_number_id
        ]
        if len(matching_phone_numbers) == 0:
            raise HTTPException(
                status_code=404, detail="Outbound phone number not found"
            )
        from_phone_number = matching_phone_numbers[0].phone_number
    else:
        from_phone_number = (
            random.choice(agent_phone_numbers).phone_number
            if len(agent_phone_numbers) > 0
            else DEFAULT_PHONE_NUMBER
        )

    phone_call_id = uuid4()
    call_sid = create_call(
        to_phone_number=request.phone_number,
        from_phone_number=from_phone_number,
        phone_call_id=phone_call_id,
    )

    await insert_phone_call(
        phone_call_id,
        user.email,
        call_sid,
        request.user_info,
        from_phone_number,
        request.phone_number,
        request.agent_id,
        PhoneCallType.outbound,
        cast(str, user.active_org_id),
        db,
    )
    await db.commit()

    # initialize queues for this call
    call_messages[phone_call_id] = AiMessageQueue()

    return OutboundCallResponse(phone_call_id=phone_call_id)


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
    event_payload = latest_phone_call_event(phone_call)
    if (
        event_payload is not None
        and event_payload["CallStatus"] in TERMINAL_PHONE_CALL_STATUSES
    ):
        raise HTTPException(status_code=400, detail="Phone call not queued")

    async with AiCaller(
        user_info=cast(dict, phone_call.input_data),
        system_prompt=phone_call.agent.system_message,
        phone_call_id=phone_call_id,
        audio_format="g711_ulaw",
        start_speaking_buffer_ms=500,
        tool_configuration=phone_call.agent.tool_configuration,
    ) as ai:
        ai.attach_queue(call_messages[phone_call_id])
        call_router = CallRouter(
            agent_id=phone_call.agent.id,
            organization_id=cast(str, phone_call.organization_id),
            from_phone_number=cast(str, phone_call.from_phone_number),
            to_phone_number=cast(str, phone_call.to_phone_number),
            call_sid=cast(str, phone_call.call_sid),
            ai_caller=ai,
            call_type=cast(PhoneCallType, phone_call.call_type),
        )
        await asyncio.gather(
            call_router.receive_from_human_call(websocket),
            call_router.send_to_human(websocket),
        )


@router.get(
    "/listen-in-stream/{phone_call_id}",
)
async def listen_in(
    phone_call_id: SerializedUUID,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    if not await check_organization_owns_agent(
        phone_call.agent.id, cast(str, user.active_org_id), db
    ):
        raise HTTPException(status_code=403, detail="Phone call not found")
    logger.info(f"Listening in for phone call {phone_call_id}")

    async def listen_in_stream(
        phone_call_id: SerializedUUID,
    ) -> AsyncGenerator[str, None]:
        queue = call_messages[phone_call_id].queue
        while True:
            message = await queue.get()
            call_ended = message.type == AiMessageEventTypes.call_end
            if call_ended:
                hang_up_sound = get_sound_base64("hang_up_sound_8k")
                if hang_up_sound is not None:
                    yield AiMessage(
                        type=AiMessageEventTypes.audio,
                        data=hang_up_sound[0],
                        metadata={},
                    ).serialized
            yield message.serialized
            if call_ended:
                break

    return StreamingResponse(
        listen_in_stream(phone_call_id), media_type="application/x-ndjson"
    )


@router.post(
    "/hang-up/{phone_call_id}",
    status_code=204,
)
async def hang_up(
    phone_call_id: SerializedUUID,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    if not await check_organization_owns_agent(
        phone_call.agent.id, cast(str, user.active_org_id), db
    ):
        raise HTTPException(status_code=403, detail="Phone call not found")
    if phone_call.call_data is not None:
        raise HTTPException(status_code=400, detail="Phone call already ended")
    phone_call_sid = cast(str, phone_call.call_sid)
    await update_phone_call(
        phone_call_id,
        None,
        PhoneCallEndReason.listener_hangup,
        db,
    )
    await db.commit()
    hang_up_phone_call(phone_call_sid)
    if phone_call_id in call_messages:
        call_messages[phone_call_id].end_call()
    return Response(status_code=204)


@router.get(
    "/call-history",
    response_model=list[PhoneCallMetadata],
)
async def get_call_history(
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> list[PhoneCallMetadata]:
    phone_calls = await get_phone_calls(cast(str, user.active_org_id), db)
    return [convert_phone_call_model(phone_call) for phone_call in phone_calls]


class AudioTranscriptResponse(BaseModel):
    speaker_segments: list[SpeakerSegment]
    bar_heights: list[BarHeight]
    total_duration: float
    audio_data_b64: str
    content_type: str


async def _handle_audio_playback_download_upload_file(
    s3_client: S3Client,
    file_path: str,
) -> AudioTranscriptResponse:
    audio_coro = s3_client.download_file(f"{file_path}/audio.mp3")
    transcript_coro = s3_client.download_file(f"{file_path}/transcript.json")
    (audio_data, _, _), (transcript_data, _, _) = await asyncio.gather(
        audio_coro, transcript_coro
    )

    samples, sample_rate = librosa.load(
        io.BytesIO(audio_data), sr=24000, mono=True
    )

    speaker_segments = [
        SpeakerSegment(
            timestamp=0,
            speaker=Speaker.user,
            transcript=json.loads(transcript_data)["text"],
            item_id="first-item-id",
        )
    ]

    bar_heights = calculate_bar_heights(
        samples, 50, speaker_segments, int(sample_rate)
    )

    audio_data_b64 = base64.b64encode(audio_data).decode("utf-8")
    return AudioTranscriptResponse(
        speaker_segments=speaker_segments,
        bar_heights=bar_heights,
        total_duration=len(samples) / sample_rate,
        audio_data_b64=audio_data_b64,
        content_type="audio/mpeg",
    )


async def _handle_audio_playback_download_log_file(
    s3_client: S3Client,
    file_path: str,
    browser_call: bool,
) -> AudioTranscriptResponse:
    file_data, mime_type, _ = await s3_client.download_file(file_path)

    if mime_type == "application/zip":
        # Handle zipped file
        with zipfile.ZipFile(io.BytesIO(file_data)) as zip_file:
            # Get first file in zip (should be the log file)
            log_filename = zip_file.namelist()[0]
            with zip_file.open(log_filename) as log_file:
                log_data = log_file.read()
    else:
        # Handle unzipped file
        log_data = file_data
    sample_rate = 8000 if not browser_call else 24000
    speaker_segments, audio_data = process_audio_data(log_data, sample_rate)
    if sample_rate == 8000:
        audio_data = audioop.ulaw2lin(audio_data, 2)

    samples = np.frombuffer(audio_data, dtype=np.int16)
    bar_heights = calculate_bar_heights(
        samples, 50, speaker_segments, sample_rate
    )

    wav_buffer = pcm_to_wav_buffer(audio_data, sample_rate)
    audio_data_b64 = base64.b64encode(wav_buffer.getvalue()).decode("utf-8")

    return AudioTranscriptResponse(
        speaker_segments=speaker_segments,
        bar_heights=bar_heights,
        total_duration=len(audio_data) / 2 / sample_rate,
        audio_data_b64=audio_data_b64,
        content_type="audio/wav",
    )


@router.get(
    "/playback/{phone_call_id}",
    response_model=AudioTranscriptResponse,
)
async def get_audio_playback(
    phone_call_id: SerializedUUID,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
):
    phone_call = await get_phone_call(phone_call_id, db)
    if phone_call is None:
        raise HTTPException(status_code=404, detail="Phone call not found")
    if cast(str, phone_call.organization_id) != cast(str, user.active_org_id):
        raise HTTPException(
            status_code=403,
            detail="Permission denied to access this phone call",
        )
    async with S3Client() as s3_client:
        file_path = cast(str, phone_call.call_data)
        if "/logs/" in file_path:
            response = await _handle_audio_playback_download_log_file(
                s3_client,
                file_path,
                cast(str, phone_call.from_phone_number) == BROWSER_NAME,
            )
        else:
            response = await _handle_audio_playback_download_upload_file(
                s3_client, file_path
            )

    return response
