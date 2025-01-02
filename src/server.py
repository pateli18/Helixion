import asyncio
import logging

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import HTMLResponse
from twilio.twiml.voice_response import Connect, VoiceResponse

from src.ai import AiCaller
from src.caller import CallRouter
from src.settings import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI()


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
    logger.info("WebSocket connection established")
    await websocket.accept()
    async with AiCaller() as ai:
        call_router = CallRouter(ai)
        await asyncio.gather(
            call_router.receive_from_human(websocket),
            call_router.send_to_human(websocket),
        )
