import json
import logging
from typing import Union

import websockets
from fastapi import WebSocket
from fastapi.websockets import WebSocketState

from src.ai.caller import AiCaller

logger = logging.getLogger(__name__)


class CallRouter:
    stream_sid: Union[str, None]
    latest_human_timestamp: int
    last_ai_item_id: Union[str, None]
    mark_queue: list[str]
    response_start_timestamp: Union[int, None]

    def __init__(self, ai_caller: AiCaller):
        self.stream_sid = None
        self.latest_human_timestamp = 0
        self.last_ai_item_id = None
        self.mark_queue = []
        self.response_start_timestamp = None
        self.ai_caller = ai_caller
        self._hang_up_requested = False

    async def send_to_human(self, websocket: WebSocket):
        try:
            async for message in self.ai_caller:
                if message["type"] == "response.function_call_arguments.done":
                    if message["name"] == "hang_up":
                        self._hang_up_requested = True
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

                    if self.response_start_timestamp is None:
                        self.response_start_timestamp = (
                            self.latest_human_timestamp
                        )

                    self.last_ai_item_id = message["item_id"]

                    if self.stream_sid is not None:
                        mark_event = {
                            "event": "mark",
                            "streamSid": self.stream_sid,
                            "mark": {"name": "responsePart"},
                        }
                        await websocket.send_json(mark_event)
                        self.mark_queue.append("responsePart")

                if message["type"] == "input_audio_buffer.speech_started":
                    if self.last_ai_item_id is not None:
                        await self.handle_speech_started(websocket)
        except Exception:
            logger.exception("Error sending to human")
        finally:
            await self.ai_caller.close()
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
            logger.info("Closed connection to human")

    async def handle_speech_started(self, websocket: WebSocket):
        if (
            len(self.mark_queue) > 0
            and self.response_start_timestamp is not None
        ):
            if self.last_ai_item_id:
                elapsed_time = (
                    self.latest_human_timestamp - self.response_start_timestamp
                )
                await self.ai_caller.truncate_message(
                    self.last_ai_item_id, elapsed_time
                )

            await websocket.send_json(
                {"event": "clear", "streamSid": self.stream_sid}
            )

            self.mark_queue.clear()
            self.last_ai_item_id = None
            self.response_start_timestamp = None

    async def receive_from_human_call(self, websocket: WebSocket):
        try:
            async for message in websocket.iter_text():
                data = json.loads(message)
                if data["event"] == "media":
                    self.latest_human_timestamp = int(
                        data["media"]["timestamp"]
                    )
                    await self.ai_caller.receive_human_audio(
                        data["media"]["payload"]
                    )
                elif data["event"] == "start":
                    self.stream_sid = data["start"]["streamSid"]
                    logger.info(
                        f"Incoming stream has started {self.stream_sid}"
                    )
                    self.response_start_timestamp = None
                    self.latest_human_timestamp = 0
                    self.last_ai_item_id = None
                elif data["event"] == "mark":
                    if self.mark_queue:
                        self.mark_queue.pop(0)
                        if (
                            self._hang_up_requested
                            and len(self.mark_queue) == 0
                        ):
                            logger.info(
                                "Hang up requested and all media processed"
                            )
                            break
        except websockets.exceptions.ConnectionClosedOK:
            logger.info("Connection closed")
        except Exception:
            logger.exception("Error receiving from human")
        finally:
            await self.ai_caller.close()
            logger.info("Closed connection to bot")
