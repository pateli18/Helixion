from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.db.base import db_setup, shutdown_session
from src.routes import browser, phone
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
    yield
    await shutdown_session()


app = FastAPI(lifespan=lifespan)
app.include_router(browser.router, prefix="/api/v1")
app.include_router(phone.router, prefix="/api/v1")

origins = ["https://app.helixion.ai"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
