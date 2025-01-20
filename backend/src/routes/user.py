import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import async_scoped_session
from svix.webhooks import Webhook, WebhookVerificationError

from src.db.api import insert_user
from src.db.base import get_session
from src.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/user",
    tags=["user"],
    responses={404: {"description": "Not found"}},
)


async def _verify_svix_webhook(request: Request) -> dict:
    headers = request.headers
    payload = await request.body()

    try:
        wh = Webhook(settings.auth_webhook_signing_secret)
        msg = wh.verify(payload, headers)  # type: ignore
    except WebhookVerificationError:
        raise HTTPException(
            status_code=400, detail="Webhook verification failed"
        )

    return msg


@router.post(
    "/webhook",
    status_code=204,
)
async def webhook(
    payload: dict = Depends(_verify_svix_webhook),
    db: async_scoped_session = Depends(get_session),
):
    if payload["event_type"] == "user.created":
        await insert_user(
            payload["user_id"],
            payload["email"],
            db,
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid event type")

    await db.commit()

    return Response(status_code=204)
