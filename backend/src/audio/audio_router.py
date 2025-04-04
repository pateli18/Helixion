import json
import logging
import time
import uuid
from typing import Optional, Union

import websockets
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from fastapi.websockets import WebSocketDisconnect, WebSocketState
from pydantic import BaseModel

from src.ai.caller import AiCaller
from src.ai.document_query import query_documents
from src.audio.sounds import get_sound_base64
from src.db.api import insert_phone_call_event, insert_text_message
from src.db.base import async_session_scope
from src.helixion_types import (
    BROWSER_NAME,
    PhoneCallEndReason,
    PhoneCallStatus,
    PhoneCallType,
    SerializedUUID,
    TextMessageType,
)
from src.settings import settings
from src.twilio_utils import (
    hang_up_phone_call,
    send_digits,
    send_text_message,
    transfer_call,
)

logger = logging.getLogger(__name__)


class HangUpReason(BaseModel):
    reason: PhoneCallEndReason
    data: dict


class CallRouter:
    agent_id: SerializedUUID
    organization_id: str
    from_phone_number: str
    to_phone_number: str
    stream_sid: Union[str, None]
    last_ai_item_id: Union[str, None]
    mark_queue: list[int]
    mark_queue_elapsed_time: int
    inter_mark_start_time: Optional[int]
    hang_up_reason: Optional[HangUpReason]
    call_type: PhoneCallType

    def __init__(
        self,
        agent_id: SerializedUUID,
        organization_id: str,
        from_phone_number: str,
        to_phone_number: str,
        call_sid: str,
        ai_caller: AiCaller,
        call_type: PhoneCallType,
    ):
        self.agent_id = agent_id
        self.organization_id = organization_id
        self.from_phone_number = from_phone_number
        self.to_phone_number = to_phone_number
        self.call_sid = call_sid
        self.stream_sid = None
        self.last_ai_item_id = None
        self.mark_queue = []
        self.mark_queue_elapsed_time = 0
        self.inter_mark_elapsed_time = 0
        self.ai_caller = ai_caller
        self.hang_up_reason = None
        self.call_type = call_type

    async def _cleanup(self) -> None:
        self.hang_up_reason = self.hang_up_reason or HangUpReason(
            reason=PhoneCallEndReason.unknown,
            data={},
        )
        phone_call_id, duration = await self.ai_caller.close(
            self.hang_up_reason.reason
        )
        if self.hang_up_reason.reason == PhoneCallEndReason.transferred:
            transfer_call(self.call_sid, self.hang_up_reason.data["number"])
        else:
            hang_up_phone_call(self.call_sid)
        logger.info("Cleanup complete")

        # twilio doesn't provide status callbacks for inbound calls
        if self.call_type == PhoneCallType.inbound:
            async with async_session_scope() as db:
                await insert_phone_call_event(
                    phone_call_id,
                    {
                        "CallDuration": duration // 1000,
                        "CallStatus": PhoneCallStatus.completed,
                        "SequenceNumber": 1,
                    },
                    db,
                )

    async def _send_text_message(self, body: str) -> None:
        message_id = str(uuid.uuid4())
        sending_phone_number = (
            self.from_phone_number
            if self.call_type == PhoneCallType.outbound
            else self.to_phone_number
        )
        receiving_phone_number = (
            self.to_phone_number
            if self.call_type == PhoneCallType.outbound
            else self.from_phone_number
        )

        output_sid = send_text_message(
            receiving_phone_number,
            body,
            sending_phone_number,
            f"https://{settings.host}/api/v1/phone/webhook/text-message-status/{message_id}",
        )
        async with async_session_scope() as db:
            await insert_text_message(
                self.agent_id,
                sending_phone_number,
                receiving_phone_number,
                body,
                TextMessageType.outbound,
                output_sid,
                str(self.ai_caller.phone_call_id),
                self.organization_id,
                db,
            )

    async def _transfer_call(self, phone_number_label: str) -> None:
        transfer_call_number: Optional[str] = next(
            (
                item["phone_number"]
                for item in self.ai_caller.tool_configuration[
                    "transfer_call_numbers"
                ]
                if item["label"] == phone_number_label
            ),
            None,
        )
        if transfer_call_number is None:
            logger.warning(
                f"Transfer call number not found: {phone_number_label}, call will not be transferred"
            )
        else:
            self.hang_up_reason = HangUpReason(
                reason=PhoneCallEndReason.transferred,
                data={"number": transfer_call_number},
            )

    async def send_to_human(self, websocket: WebSocket):
        try:
            async for message in self.ai_caller:
                if message["type"] == "response.function_call_arguments.done":
                    if message["name"] == "hang_up":
                        arguments = json.loads(message["arguments"])
                        if arguments["reason"] == "answering_machine":
                            self.hang_up_reason = HangUpReason(
                                reason=PhoneCallEndReason.voice_mail_bot,
                                data={},
                            )
                            logger.info(
                                "Answering machine detected, not leaving a message"
                            )
                            break
                        else:
                            self.hang_up_reason = HangUpReason(
                                reason=PhoneCallEndReason.end_of_call_bot,
                                data={},
                            )
                            logger.info("Hang up requested by bot")
                    elif message["name"] == "cancel_hang_up":
                        self.hang_up_reason = None
                        logger.info("Hang up cancelled")
                    elif message["name"] == "query_documents":
                        arguments = json.loads(message["arguments"])
                        query = arguments["query"]
                        documents = await query_documents(
                            query,
                            self.ai_caller.tool_configuration.get(
                                "knowledge_bases", []
                            ),
                        )
                        await self.ai_caller.receive_tool_call_result(
                            message["item_id"],
                            message["call_id"],
                            documents,
                        )
                    elif message["name"] == "send_text_message":
                        arguments = json.loads(message["arguments"])
                        await self._send_text_message(
                            arguments["message"],
                        )
                    elif message["name"] == "transfer_call":
                        arguments = json.loads(message["arguments"])
                        await self._transfer_call(
                            arguments["phone_number_label"]
                        )
                    elif message["name"] == "enter_keypad":
                        arguments = json.loads(message["arguments"])
                        send_digits(self.call_sid, arguments["digits"])
                    else:
                        logger.warning(
                            f"Received unexpected function call: {message['name']}"
                        )

                if message["type"] == "response.audio.delta":
                    audio_delta = {
                        "event": "media",
                        "streamSid": self.stream_sid,
                        "media": {
                            "payload": message["delta"],
                        },
                    }
                    await websocket.send_json(audio_delta)

                    if self.last_ai_item_id is None:
                        self.last_ai_item_id = message["item_id"]
                        self.mark_queue_elapsed_time = 0
                        self.inter_mark_start_time = None
                        self.mark_queue.clear()

                    if self.stream_sid is not None:
                        mark_event = {
                            "event": "mark",
                            "streamSid": self.stream_sid,
                            "mark": {"name": "responsePart"},
                        }
                        await websocket.send_json(mark_event)
                        self.mark_queue.append(message["audio_ms"])

                if message["type"] == "input_audio_buffer.speech_started":
                    await self.handle_speech_started(websocket)
        except WebSocketDisconnect:
            logger.info("Connection closed")
        except Exception:
            logger.exception("Error sending to human")
        finally:
            await self._cleanup()

    async def _truncate_audio_message(self) -> None:
        if self.last_ai_item_id is not None:
            if self.inter_mark_start_time is not None:
                self.inter_mark_elapsed_time = (
                    int(time.time() * 1000) - self.inter_mark_start_time
                )
                self.mark_queue_elapsed_time += min(
                    self.inter_mark_elapsed_time,
                    (
                        self.mark_queue[0]
                        if len(self.mark_queue) > 0
                        else self.inter_mark_elapsed_time
                    ),
                )
            await self.ai_caller.truncate_message(
                self.last_ai_item_id, self.mark_queue_elapsed_time
            )

    async def handle_speech_started(self, websocket: WebSocket):
        if len(self.mark_queue) > 0:
            await self._truncate_audio_message()
            await websocket.send_json(
                {"event": "clear", "streamSid": self.stream_sid}
            )

            self.mark_queue.clear()
        self.last_ai_item_id = None
        self.mark_queue_elapsed_time = 0
        self.inter_mark_start_time = None

    async def receive_from_human_call(self, websocket: WebSocket):
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                if data["event"] == "media":
                    await self.ai_caller.receive_human_audio(
                        data["media"]["payload"]
                    )
                elif data["event"] == "start":
                    self.stream_sid = data["start"]["streamSid"]
                    self.last_ai_item_id = None
                    self.mark_queue_elapsed_time = 0
                    self.mark_queue.clear()
                elif data["event"] == "mark":
                    if self.mark_queue:
                        time_ms = self.mark_queue.pop(0)
                        self.mark_queue_elapsed_time += time_ms
                        self.inter_mark_start_time = (
                            int(time.time() * 1000)
                            if len(self.mark_queue) > 0
                            else None
                        )
                        if (
                            self.hang_up_reason is not None
                            and len(self.mark_queue) == 0
                        ):
                            logger.info(
                                "Hang up requested and all media processed"
                            )
                            break
        except websockets.exceptions.ConnectionClosedOK:
            logger.info("Connection closed")
            self.hang_up_reason = HangUpReason(
                reason=PhoneCallEndReason.user_hangup,
                data={},
            )
            await self._truncate_audio_message()
        except Exception:
            logger.exception("Error receiving from human")
        finally:
            await self._cleanup()


class BrowserRouter:
    agent_id: SerializedUUID
    organization_id: str
    last_ai_item_id: Union[str, None]
    mark_queue: list[int]
    mark_queue_elapsed_time: int
    inter_mark_start_time: Optional[int]
    hang_up_reason: Optional[HangUpReason]

    def __init__(
        self,
        agent_id: SerializedUUID,
        organization_id: str,
        ai_caller: AiCaller,
    ):
        self.agent_id = agent_id
        self.organization_id = organization_id
        self.last_ai_item_id = None
        self.mark_queue = []
        self.mark_queue_elapsed_time = 0
        self.ai_caller = ai_caller
        self.hang_up_reason = None
        self._cleanup_started = False

    async def _cleanup(self, websocket: WebSocket) -> None:
        if self._cleanup_started:
            logger.info("Cleanup already started")
            return
        self._cleanup_started = True
        self.hang_up_reason = self.hang_up_reason or HangUpReason(
            reason=PhoneCallEndReason.unknown,
            data={},
        )
        if (
            self.hang_up_reason.reason == PhoneCallEndReason.transferred
            and websocket.client_state == WebSocketState.CONNECTED
        ):
            await websocket.send_json(
                {
                    "event": "message",
                    "payload": {
                        "title": "Call Transfer",
                        "body": f"Call would be transferred to {self.hang_up_reason.data['number']}",
                    },
                }
            )

        phone_call_id, duration = await self.ai_caller.close(
            self.hang_up_reason.reason
            if self.hang_up_reason is not None
            else PhoneCallEndReason.unknown
        )
        async with async_session_scope() as db:
            await insert_phone_call_event(
                phone_call_id,
                {
                    "CallDuration": duration // 1000,
                    "CallStatus": PhoneCallStatus.completed,
                    "SequenceNumber": 1,
                },
                db,
            )

    async def _send_text_message(
        self, body: str, websocket: WebSocket
    ) -> None:
        await websocket.send_json(
            {
                "event": "message",
                "payload": {"title": "SMS Message", "body": body},
            }
        )
        async with async_session_scope() as db:
            await insert_text_message(
                self.agent_id,
                BROWSER_NAME,
                BROWSER_NAME,
                body,
                TextMessageType.outbound,
                "no-sid",
                str(self.ai_caller.phone_call_id),
                self.organization_id,
                db,
            )

    async def _transfer_call(
        self, phone_number_label: str, websocket: WebSocket
    ) -> None:
        transfer_call_number: Optional[str] = next(
            (
                item["phone_number"]
                for item in self.ai_caller.tool_configuration[
                    "transfer_call_numbers"
                ]
                if item["label"] == phone_number_label
            ),
            None,
        )
        if transfer_call_number is None:
            logger.warning(
                f"Transfer call number not found: {phone_number_label}, call will not be transferred"
            )
        else:
            self.hang_up_reason = HangUpReason(
                reason=PhoneCallEndReason.transferred,
                data={"number": transfer_call_number},
            )

    async def send_to_human(self, websocket: WebSocket):
        try:
            async for message in self.ai_caller:
                if message["type"] == "response.function_call_arguments.done":
                    if message["name"] == "hang_up":
                        hang_up_sound = get_sound_base64("hang_up_sound_24k")
                        if hang_up_sound is not None:
                            await websocket.send_json(
                                {
                                    "event": "media",
                                    "payload": hang_up_sound[0],
                                }
                            )
                            self.mark_queue.append(hang_up_sound[1])
                        else:
                            logger.warning("Hang up sound not found")
                        arguments = json.loads(message["arguments"])
                        if arguments["reason"] == "answering_machine":
                            self.hang_up_reason = HangUpReason(
                                reason=PhoneCallEndReason.voice_mail_bot,
                                data={},
                            )
                            logger.info(
                                "Answering machine detected, not leaving a message"
                            )
                        else:
                            self.hang_up_reason = HangUpReason(
                                reason=PhoneCallEndReason.end_of_call_bot,
                                data={},
                            )
                            logger.info("Hang up requested by bot")
                    elif message["name"] == "cancel_hang_up":
                        self.hang_up_reason = None
                        logger.info("Hang up cancelled")
                    elif message["name"] == "query_documents":
                        arguments = json.loads(message["arguments"])
                        query = arguments["query"]
                        documents = await query_documents(
                            query,
                            self.ai_caller.tool_configuration.get(
                                "knowledge_bases", []
                            ),
                        )
                        await self.ai_caller.receive_tool_call_result(
                            message["item_id"],
                            message["call_id"],
                            documents,
                        )
                    elif message["name"] == "send_text_message":
                        arguments = json.loads(message["arguments"])
                        await self._send_text_message(
                            arguments["message"],
                            websocket,
                        )
                    elif message["name"] == "transfer_call":
                        arguments = json.loads(message["arguments"])
                        await self._transfer_call(
                            arguments["phone_number_label"], websocket
                        )
                    elif message["name"] == "enter_keypad":
                        arguments = json.loads(message["arguments"])
                        await websocket.send_json(
                            {
                                "event": "message",
                                "payload": {
                                    "title": "Keypad",
                                    "body": arguments["digits"],
                                },
                            }
                        )
                    else:
                        logger.warning(
                            f"Received unexpected function call: {message['name']}"
                        )

                elif message["type"] == "response.audio.delta":
                    await websocket.send_json(
                        {"event": "media", "payload": message["delta"]}
                    )

                    if self.last_ai_item_id is None:
                        self.last_ai_item_id = message["item_id"]
                        self.mark_queue_elapsed_time = 0
                        self.inter_mark_start_time = None
                        self.mark_queue.clear()
                    self.mark_queue.append(message["audio_ms"])

                elif message["type"] == "input_audio_buffer.speech_started":
                    await self.handle_speech_started(websocket)

                elif message["type"] == "response.audio_transcript.done":
                    await websocket.send_json(
                        {
                            "event": "speaker_segments",
                            "payload": jsonable_encoder(
                                message["speaker_segments"]
                            ),
                        },
                    )
                elif (
                    message["type"]
                    == "conversation.item.input_audio_transcription.completed"
                ):
                    await websocket.send_json(
                        {
                            "event": "speaker_segments",
                            "payload": jsonable_encoder(
                                message["speaker_segments"]
                            ),
                        }
                    )
        except WebSocketDisconnect:
            logger.info("Connection closed")
        except Exception:
            logger.exception("Error sending to human")
        finally:
            await self._cleanup(websocket)
            if websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.close()
                except RuntimeError as e:
                    if (
                        "Cannot call 'send' once a close message has been sent"
                        in str(e)
                    ):
                        logger.info("Connection already closed")
                    else:
                        logger.exception("Error closing websocket")
            logger.info("Closed connection to human")

    async def _truncate_audio_message(self) -> None:
        if self.last_ai_item_id is not None:
            if self.inter_mark_start_time is not None:
                self.inter_mark_elapsed_time = (
                    int(time.time() * 1000) - self.inter_mark_start_time
                )
                self.mark_queue_elapsed_time += min(
                    self.inter_mark_elapsed_time,
                    (
                        self.mark_queue[0]
                        if len(self.mark_queue) > 0
                        else self.inter_mark_elapsed_time
                    ),
                )
            await self.ai_caller.truncate_message(
                self.last_ai_item_id, self.mark_queue_elapsed_time
            )

    async def handle_speech_started(self, websocket: WebSocket):
        if len(self.mark_queue) > 0:
            await self._truncate_audio_message()
            await websocket.send_json({"event": "clear"})

            self.mark_queue.clear()
        self.last_ai_item_id = None
        self.mark_queue_elapsed_time = 0
        self.inter_mark_start_time = None

    async def receive_from_human_call(self, websocket: WebSocket):
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                if data["event"] == "media":
                    await self.ai_caller.receive_human_audio(data["payload"])
                elif data["event"] == "start":
                    logger.info("Incoming stream has started")
                    self.last_ai_item_id = None
                    self.mark_queue_elapsed_time = 0
                    self.mark_queue.clear()
                elif data["event"] == "mark":
                    if self.mark_queue:
                        time_ms = self.mark_queue.pop(0)
                        self.mark_queue_elapsed_time += time_ms
                        self.inter_mark_start_time = (
                            int(time.time() * 1000)
                            if len(self.mark_queue) > 0
                            else None
                        )
                        if (
                            self.hang_up_reason is not None
                            and len(self.mark_queue) == 0
                        ):
                            logger.info(
                                "Hang up requested and all media processed"
                            )
                            break
                elif data["event"] == "hangup":
                    logger.info("Hang up requested by user")
                    self.hang_up_reason = HangUpReason(
                        reason=PhoneCallEndReason.user_hangup,
                        data={},
                    )
                    await self._truncate_audio_message()
                    break
        except websockets.exceptions.ConnectionClosedOK:
            logger.info("Connection closed")
            if self.hang_up_reason is None:
                self.hang_up_reason = HangUpReason(
                    reason=PhoneCallEndReason.user_hangup,
                    data={},
                )
                await self._truncate_audio_message()
        except Exception:
            logger.exception("Error receiving from human")
        finally:
            await self._cleanup(websocket)
            logger.info("Closed connection to bot")
