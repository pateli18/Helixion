import json
import logging
import time
from typing import Optional, Union

import websockets
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from fastapi.websockets import WebSocketState
from twilio.request_validator import RequestValidator
from twilio.rest import Client

from src.ai.caller import AiCaller
from src.ai.document_query import query_documents
from src.db.api import insert_phone_call_event
from src.db.base import async_session_scope
from src.helixion_types import PhoneCallEndReason, PhoneCallStatus
from src.settings import settings

logger = logging.getLogger(__name__)

twilio_client = Client(
    account_sid=settings.twilio_account_sid,
    password=settings.twilio_password,
    username=settings.twilio_username,
)
twilio_request_validator = RequestValidator(settings.twilio_auth_token)


def hang_up_phone_call(call_sid: str):
    twilio_client.calls(call_sid).update(status="completed")


class CallRouter:
    stream_sid: Union[str, None]
    last_ai_item_id: Union[str, None]
    mark_queue: list[int]
    mark_queue_elapsed_time: int
    inter_mark_start_time: Optional[int]
    hang_up_reason: Optional[PhoneCallEndReason]

    def __init__(self, call_sid: str, ai_caller: AiCaller):
        self.call_sid = call_sid
        self.stream_sid = None
        self.last_ai_item_id = None
        self.mark_queue = []
        self.mark_queue_elapsed_time = 0
        self.inter_mark_elapsed_time = 0
        self.ai_caller = ai_caller
        self._hang_up_reason = None

    async def _cleanup(self) -> None:
        await self.ai_caller.close(
            self._hang_up_reason or PhoneCallEndReason.unknown
        )
        hang_up_phone_call(self.call_sid)
        logger.info("Cleanup complete")

    async def send_to_human(self, websocket: WebSocket):
        try:
            async for message in self.ai_caller:
                if message["type"] == "response.function_call_arguments.done":
                    if message["name"] == "hang_up":
                        arguments = json.loads(message["arguments"])
                        if arguments["reason"] == "answering_machine":
                            self._hang_up_reason = (
                                PhoneCallEndReason.voice_mail_bot
                            )
                            logger.info(
                                "Answering machine detected, not leaving a message"
                            )
                            break
                        else:
                            self._hang_up_reason = (
                                PhoneCallEndReason.end_of_call_bot
                            )
                            logger.info("Hang up requested by bot")
                    elif message["name"] == "query_documents":
                        arguments = json.loads(message["arguments"])
                        query = arguments["query"]
                        documents = await query_documents(
                            query, self.ai_caller.documents
                        )
                        await self.ai_caller.receive_tool_call_result(
                            message["item_id"],
                            message["call_id"],
                            documents,
                        )
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
                            self._hang_up_reason is not None
                            and len(self.mark_queue) == 0
                        ):
                            logger.info(
                                "Hang up requested and all media processed"
                            )
                            break
        except websockets.exceptions.ConnectionClosedOK:
            logger.info("Connection closed")
            self._hang_up_reason = PhoneCallEndReason.user_hangup
            await self._truncate_audio_message()
        except Exception:
            logger.exception("Error receiving from human")
        finally:
            await self._cleanup()


class BrowserRouter:
    last_ai_item_id: Union[str, None]
    mark_queue: list[int]
    mark_queue_elapsed_time: int
    inter_mark_start_time: Optional[int]
    hang_up_reason: Optional[PhoneCallEndReason]

    def __init__(self, ai_caller: AiCaller):
        self.last_ai_item_id = None
        self.mark_queue = []
        self.mark_queue_elapsed_time = 0
        self.ai_caller = ai_caller
        self._hang_up_reason = None
        self._cleanup_started = False

    async def _cleanup(self) -> None:
        if self._cleanup_started:
            logger.info("Cleanup already started")
            return
        self._cleanup_started = True
        logger.info(f"Closing call with reason: {self._hang_up_reason}")
        phone_call_id, duration = await self.ai_caller.close(
            self._hang_up_reason or PhoneCallEndReason.unknown
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

    async def send_to_human(self, websocket: WebSocket):
        try:
            async for message in self.ai_caller:
                if message["type"] == "response.function_call_arguments.done":
                    if message["name"] == "hang_up":
                        arguments = json.loads(message["arguments"])
                        if arguments["reason"] == "answering_machine":
                            self._hang_up_reason = (
                                PhoneCallEndReason.voice_mail_bot
                            )
                            logger.info(
                                "Answering machine detected, not leaving a message"
                            )
                        else:
                            self._hang_up_reason = (
                                PhoneCallEndReason.end_of_call_bot
                            )
                            logger.info("Hang up requested by bot")
                    elif message["name"] == "query_documents":
                        arguments = json.loads(message["arguments"])
                        query = arguments["query"]
                        documents = await query_documents(
                            query, self.ai_caller.documents
                        )
                        await self.ai_caller.receive_tool_call_result(
                            message["item_id"],
                            message["call_id"],
                            documents,
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

        except Exception:
            logger.exception("Error sending to human")
        finally:
            await self._cleanup()
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
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
                            self._hang_up_reason is not None
                            and len(self.mark_queue) == 0
                        ):
                            logger.info(
                                "Hang up requested and all media processed"
                            )
                            break
                elif data["event"] == "hangup":
                    logger.info("Hang up requested by user")
                    self._hang_up_reason = PhoneCallEndReason.user_hangup
                    await self._truncate_audio_message()
                    break
        except websockets.exceptions.ConnectionClosedOK:
            logger.info("Connection closed")
            if self._hang_up_reason is None:
                self._hang_up_reason = PhoneCallEndReason.user_hangup
                await self._truncate_audio_message()
        except Exception:
            logger.exception("Error receiving from human")
        finally:
            await self._cleanup()
            logger.info("Closed connection to bot")
