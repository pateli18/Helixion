import logging

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import async_scoped_session

from src.clinicontact_types import SerializedUUID
from src.db.models import PhoneCallModel

logger = logging.getLogger(__name__)


async def insert_phone_call(
    id: SerializedUUID,
    call_sid: str,
    input_data: dict,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(PhoneCallModel).values(
            id=id,
            call_sid=call_sid,
            input_data=input_data,
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
