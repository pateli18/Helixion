import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.db.base import db_setup, shutdown_session
from src.routes import browser, phone
from src.settings import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_setup()
    yield
    await shutdown_session()


app = FastAPI(lifespan=lifespan)
app.include_router(browser.router, prefix="/api/v1")
app.include_router(phone.router, prefix="/api/v1")

origins = ["https://clinicontact-frontend.onrender.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
