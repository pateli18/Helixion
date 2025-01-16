import logging

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import async_scoped_session
from sqlalchemy.orm import selectinload

from src.db.models import PhoneCallModel
from src.db.models.PhoneCall import PhoneCallEventModel
from src.helixion_types import SerializedUUID

logger = logging.getLogger(__name__)


async def insert_phone_call(
    id: SerializedUUID,
    call_sid: str,
    input_data: dict,
    from_phone_number: str,
    to_phone_number: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(PhoneCallModel).values(
            id=id,
            call_sid=call_sid,
            input_data=input_data,
            from_phone_number=from_phone_number,
            to_phone_number=to_phone_number,
        )
    )


async def get_phone_call(
    phone_call_id: SerializedUUID,
    db: async_scoped_session,
) -> PhoneCallModel:
    result = await db.execute(
        select(PhoneCallModel).where(PhoneCallModel.id == phone_call_id)
    )
    return result.scalar_one_or_none()


async def insert_phone_call_event(
    phone_call_id: SerializedUUID,
    payload: dict,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(PhoneCallEventModel).values(
            phone_call_id=phone_call_id,
            payload=payload,
        )
    )


async def update_phone_call(
    phone_call_id: SerializedUUID,
    call_data: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(PhoneCallModel)
        .where(PhoneCallModel.id == phone_call_id)
        .values(call_data=call_data)
    )


async def get_phone_calls(db: async_scoped_session) -> list[PhoneCallModel]:
    result = await db.execute(
        select(PhoneCallModel)
        .options(selectinload(PhoneCallModel.events))
        .order_by(PhoneCallModel.created_at.desc())
    )
    return list(result.scalars().all())
