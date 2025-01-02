import asyncio
import json
import logging
import uuid
from contextlib import AsyncExitStack
from datetime import datetime
from pathlib import Path
from typing import AsyncContextManager, AsyncIterator, Literal, Optional

import aiofiles
import websockets
from pydantic import BaseModel

from src.settings import settings

logger = logging.getLogger(__name__)

SYSTEM_MESSAGE = """
You are given the following script to follow. If the user asks a question unrelated to the script, politely
say that you'd like to stick to the topic of the script.

Staff member: Thank you for contacting us about the Kids and Adults Together study! My name is
Betty and I am a research assistant in the BE-RAD Lab at Kent State University. If you have time, I’d like
to tell you a little more about the study, and then if it’s okay with you, ask some brief questions about you
and your child. Does that sound okay?
[If parent responds negatively] Okay, is there another time that would be better for me to contact you? [And
then schedule another time]
[If parent answers positively] Great! This study is being conducted in the Psychological Sciences department
at Kent State University. We are interested in seeing how parents and kids work together, and how families
differ from one another. To participate in this study, you would need to have a child who is between 8-10
years old, and you would need to be their biological and custodial parent. Is that true for you?
[If parent responds negatively] Okay, thanks for letting me know. It doesn’t sound like you would be eligible
to participate in our current study, but we will certainly be doing more studies in the future. Would it be okay
if we kept your contact information and got in touch in the future if we have another study you may be
interested in? [Then collect contact info and referral information]
[If parent answers positively] Great! If you wanted to participate, the study would take place over two
sessions. In the first session, we would interview you about any mood or behavior difficulties you have had
during your life. This interview would take place over Teams or Zoom, so you would need to be in a quiet,
private place with an internet-enabled device (like a computer, tablet, or smart phone). The interview usually
takes about 90 minutes. Do you have any questions so far?
[If parent says yes, answer questions; if parent says no, continue below.]
After the interview, we would then ask you and your child to come to our lab at Kent at a time that worked
for you. During your visit, we would ask both you and your child to fill out some forms and do a task
together. We would also collect your spit a few times during the visit to look at different kinds of chemicals
in your body. We expect this visit to last about 90 minutes, and you and your child would both be paid for
your time. Does that all sound okay with you?
[If parent responds negatively] Okay, well thanks for reaching out for more information about this study!
Have a great day!
[If parent responds positively] Great! If it’s okay with you, I’d like to ask you a few more questions. Do you
agree to participate in the screening for this research study, which includes questions about mental health? If
you agree, the information you provide will be confidential, and we will not share it with anyone outside of
the study team.
[If parent responds positively] Great! Before I ask you those questions, do you have any questions for me?
[Answer parent’s questions, then continue on to questions below]

Fields to collect (make sure to clarify the spelling of a field where the user's input is unclear):
- Date  
- Parent’s Name  
  - Biological & Custodial Parent? (Yes/No)  
- Telephone #  
- Email address  
- Preferred contact method (Circle one): Phone / Email  
- Best time(s) to contact  
- Parent’s Date of Birth  
- Parent’s Sex (Male/Female/Other)  
- If female, is the mother pregnant or breastfeeding? (Circle one: Pregnant / Breastfeeding / Neither)  

**Child Information:**  
- Child’s Name  
- Child’s Date of Birth  
- Child’s Sex (Male/Female/Other)  
- Is English the first language spoken in the home? (Yes/No)  
  - Notes  

**Parent’s Mental Health:**  
- Diagnosis of Depression for PARENT? (Yes/No)  
  - If yes, during the child’s lifetime? (Yes/No)  
  - Notes  
- Parent ever diagnosed with another psychiatric disorder? (Yes/No)  
  - If yes, during the child’s lifetime? (Yes/No)  
  - Notes  

**Parent’s Physical Health:**  
- Parent has major medical conditions? (Yes/No)  
  - If yes, specify  
- Parent’s current medications (if none, write N/A)  

**Child’s Mental Health:**  
- Diagnosis of Depression for CHILD? (Yes/No)  
  - Notes  
- Child ever diagnosed with another psychiatric disorder? (Yes/No)  
  - Notes  

**Child’s Physical Health:**  
- Child has major medical conditions? (Yes/No)  
  - If yes, specify  
- Child’s current medications (if none, write N/A)  

**Additional Information:**  
- Any other information you want to share with us?  
- May we contact you about future studies in our lab? (Yes/No)  
- How did you hear about our project?  
"""

AudioFormat = Literal["pcm16", "g711_ulaw", "g711_alaw"]
Voice = Literal[
    "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"
]


class AiSessionConfiguration(BaseModel):
    turn_detection: Optional[dict]
    input_audio_format: Optional[AudioFormat]
    output_audio_format: Optional[AudioFormat]
    voice: Optional[Voice]
    instructions: Optional[str]
    input_audio_transcription: Optional[dict]

    @classmethod
    def default(cls) -> "AiSessionConfiguration":
        return cls(
            turn_detection={"type": "server_vad"},
            input_audio_format="g711_ulaw",
            output_audio_format="g711_ulaw",
            voice="shimmer",
            instructions=SYSTEM_MESSAGE,
            input_audio_transcription={
                "model": "whisper-1",
            },
        )


class AiCaller(AsyncContextManager["AiCaller"]):
    def __init__(
        self, session_configuration: Optional[AiSessionConfiguration] = None
    ):
        self._exit_stack = AsyncExitStack()
        self._ws_client = None
        self._log_file: Optional[str] = None
        self.session_configuration = (
            session_configuration or AiSessionConfiguration.default()
        )

    async def __aenter__(self) -> "AiCaller":
        self._ws_client = await self._exit_stack.enter_async_context(
            websockets.connect(
                "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
                additional_headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "OpenAI-Beta": "realtime=v1",
                },
            )
        )
        await self.initialize_session()
        self._log_file = f"logs/{uuid.uuid4()}.log"
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self._exit_stack.__aexit__(exc_type, exc, tb)
        self._log_file = None

    @property
    def client(self):
        if not self._ws_client:
            raise RuntimeError("WebSocket client not initialized")
        return self._ws_client

    @property
    def log_file(self) -> str:
        if not self._log_file:
            raise RuntimeError("Log file not initialized")
        Path(self._log_file).parent.mkdir(parents=True, exist_ok=True)
        return self._log_file

    async def initialize_session(self):
        session_update = {
            "type": "session.update",
            "session": self.session_configuration.model_dump(),
        }
        await self.send_message(json.dumps(session_update))

    async def _log_message(self, message: websockets.Data):
        # Ensure log directory exists
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] {message}\n"
        try:
            async with aiofiles.open(self.log_file, mode="a") as f:
                await f.write(log_entry)
        except Exception:
            logger.exception("Error writing to log file")

    async def send_message(self, message: str):
        asyncio.create_task(self._log_message(message))
        await self.client.send(message)

    async def truncate_message(self, item_id: str, audio_end_ms: int):
        truncate_event = {
            "type": "conversation.item.truncate",
            "item_id": item_id,
            "content_index": 0,
            "audio_end_ms": audio_end_ms,
        }
        await self.send_message(json.dumps(truncate_event))

    async def receive_human_audio(self, audio: str):
        audio_append = {
            "type": "input_audio_buffer.append",
            "audio": audio,
        }
        await self.send_message(json.dumps(audio_append))

    async def _message_handler(self, message: websockets.Data) -> dict:
        asyncio.create_task(self._log_message(message))

        response = json.loads(message)
        return response

    async def close(self):
        """Close the websocket connection gracefully"""
        if self._ws_client is not None:
            await self._ws_client.close()

    async def __aiter__(self) -> AsyncIterator[dict]:
        while True:
            try:
                message = await self.client.recv()
                processed_message = await self._message_handler(message)
                yield processed_message
            except websockets.exceptions.ConnectionClosed:
                logger.info("Connection closed to openai")
                return
