import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import async_scoped_session
from svix.webhooks import Webhook, WebhookVerificationError

from src.db.api import (
    get_user,
    insert_organization,
    insert_user,
    update_user_organization,
)
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
        user_model = await get_user(payload["user_id"], db)
        if user_model is None:
            await insert_user(
                payload["user_id"],
                payload["email"],
                db,
            )
        else:
            logger.warning(
                "User already exists in the database",
            )
    elif payload["event_type"] == "user.added_to_org":
        await update_user_organization(
            payload["user_id"],
            payload["org_id"],
            db,
        )
    elif payload["event_type"] == "org.created":
        await insert_organization(
            payload["org_id"],
            payload["name"],
            db,
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid event type")

    await db.commit()

    return Response(status_code=204)
