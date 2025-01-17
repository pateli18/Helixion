import logging
from typing import Optional

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import async_scoped_session
from sqlalchemy.orm import joinedload, selectinload

from src.db.models import AgentModel, PhoneCallEventModel, PhoneCallModel
from src.helixion_types import AgentBase, SerializedUUID

logger = logging.getLogger(__name__)


async def insert_phone_call(
    id: SerializedUUID,
    call_sid: str,
    input_data: dict,
    from_phone_number: str,
    to_phone_number: str,
    agent_id: SerializedUUID,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(PhoneCallModel).values(
            id=id,
            call_sid=call_sid,
            input_data=input_data,
            from_phone_number=from_phone_number,
            to_phone_number=to_phone_number,
            agent_id=agent_id,
        )
    )


async def get_phone_call(
    phone_call_id: SerializedUUID,
    db: async_scoped_session,
) -> PhoneCallModel:
    result = await db.execute(
        select(PhoneCallModel)
        .options(joinedload(PhoneCallModel.agent))
        .where(PhoneCallModel.id == phone_call_id)
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


async def insert_agent(
    payload: AgentBase,
    db: async_scoped_session,
) -> AgentModel:
    if payload.active is True:
        # disable all other agents with the same base_id
        await db.execute(
            update(AgentModel)
            .where(AgentModel.base_id == payload.base_id)
            .values(active=False)
        )
    result = await db.execute(
        insert(AgentModel).returning(AgentModel).values(payload.model_dump())
    )
    agent_model = result.scalar_one()
    return agent_model


async def get_agent(
    agent_id: SerializedUUID, db: async_scoped_session
) -> Optional[AgentModel]:
    result = await db.execute(
        select(AgentModel).where(AgentModel.id == agent_id)
    )
    return result.scalar_one_or_none()


async def get_agents(db: async_scoped_session) -> list[AgentModel]:
    result = await db.execute(
        select(AgentModel).order_by(AgentModel.created_at.desc())
    )
    return list(result.scalars().all())
