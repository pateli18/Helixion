from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from src.audio.sounds import initialize_sounds_cache
from src.db.base import db_setup, shutdown_session
from src.routes import agent, browser, phone, user
from src.settings import settings, setup_logging

setup_logging()

if settings.sentry_dsn is not None:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_setup()
    await initialize_sounds_cache()
    yield
    await shutdown_session()


app = FastAPI(
    lifespan=lifespan,
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
)
app.include_router(browser.router, prefix="/api/v1")
app.include_router(phone.router, prefix="/api/v1")
app.include_router(agent.router, prefix="/api/v1")
app.include_router(user.router, prefix="/api/v1")

origins = ["https://app.helixion.ai"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
