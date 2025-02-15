import logging
from typing import Optional

from sqlalchemy import Select, insert, select, update
from sqlalchemy.ext.asyncio import async_scoped_session
from sqlalchemy.orm import joinedload, selectinload

from src.db.models import (
    AgentDocumentModel,
    AgentModel,
    AnalyticsReportModel,
    AnalyticsTagGroupModel,
    DocumentModel,
    OrganizationModel,
    PhoneCallEventModel,
    PhoneCallModel,
    TextMessageEventModel,
    TextMessageModel,
    UserModel,
)
from src.helixion_types import (
    AgentBase,
    PhoneCallEndReason,
    PhoneCallType,
    SerializedUUID,
    TextMessageType,
)

logger = logging.getLogger(__name__)


async def insert_phone_call(
    id: SerializedUUID,
    initiator: str,
    call_sid: str,
    input_data: dict,
    from_phone_number: str,
    to_phone_number: str,
    agent_id: Optional[SerializedUUID],
    call_type: PhoneCallType,
    organization_id: str,
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
            call_type=call_type.value,
            initiator=initiator,
            organization_id=organization_id,
        )
    )


async def get_phone_call(
    phone_call_id: SerializedUUID,
    db: async_scoped_session,
) -> PhoneCallModel:
    result = await db.execute(
        select(PhoneCallModel)
        .options(selectinload(PhoneCallModel.events))
        .options(
            joinedload(PhoneCallModel.agent).selectinload(
                AgentModel.phone_numbers
            )
        )
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
    call_data: Optional[str],
    phone_call_end_reason: PhoneCallEndReason,
    db: async_scoped_session,
) -> None:
    payload = {}
    if call_data is not None:
        payload["call_data"] = call_data

    # check if an end reason already exists
    result = await db.execute(
        select(PhoneCallModel)
        .where(PhoneCallModel.id == phone_call_id)
        .where(PhoneCallModel.end_reason.isnot(None))
    )
    if result.scalar_one_or_none() is None:
        payload["end_reason"] = phone_call_end_reason.value

    await db.execute(
        update(PhoneCallModel)
        .where(PhoneCallModel.id == phone_call_id)
        .values(payload)
    )


async def get_phone_calls(
    organization_id: str, db: async_scoped_session
) -> list[PhoneCallModel]:
    result = await db.execute(
        select(PhoneCallModel)
        .options(selectinload(PhoneCallModel.events))
        .options(
            joinedload(PhoneCallModel.agent).selectinload(
                AgentModel.phone_numbers
            )
        )
        .where(PhoneCallModel.organization_id == organization_id)
        .order_by(PhoneCallModel.created_at.desc())
    )
    return list(result.scalars().all())


async def insert_agent(
    payload: AgentBase,
    user_id: str,
    organization_id: str,
    db: async_scoped_session,
) -> SerializedUUID:
    if payload.active is True:
        # disable all other agents with the same base_id
        await db.execute(
            update(AgentModel)
            .where(AgentModel.base_id == payload.base_id)
            .values(active=False)
        )
    insert_values = {
        **payload.model_dump(),
        "user_id": user_id,
        "organization_id": organization_id,
    }

    result = await db.execute(
        insert(AgentModel).returning(AgentModel.id).values(insert_values)
    )
    return result.scalar_one()


def _base_agent_query() -> Select:
    return (
        select(AgentModel)
        .options(
            selectinload(AgentModel.documents)
            .joinedload(AgentDocumentModel.document)
            .load_only(
                DocumentModel.id,  # type: ignore
                DocumentModel.name,  # type: ignore
            )
        )
        .options(selectinload(AgentModel.user))
    )


async def get_agent(
    agent_id: SerializedUUID, db: async_scoped_session
) -> Optional[AgentModel]:
    query = _base_agent_query()
    result = await db.execute(query.where(AgentModel.id == agent_id))
    return result.scalar_one_or_none()


async def get_agent_by_incoming_phone_number(
    incoming_phone_number: str,
    db: async_scoped_session,
) -> Optional[AgentModel]:
    query = _base_agent_query()
    result = await db.execute(
        query.where(AgentModel.incoming_phone_number == incoming_phone_number)
    )
    return result.scalar_one_or_none()


async def get_agents(
    organization_id: str, db: async_scoped_session
) -> list[AgentModel]:
    result = await db.execute(
        select(AgentModel)
        .options(
            selectinload(AgentModel.documents)
            .joinedload(AgentDocumentModel.document)
            .load_only(
                DocumentModel.id,  # type: ignore
                DocumentModel.name,  # type: ignore
            )
        )
        .options(selectinload(AgentModel.user))
        .where(AgentModel.organization_id == organization_id)
        .order_by(AgentModel.created_at.desc())
    )
    return list(result.scalars().unique().all())


async def insert_user(
    user_id: str,
    email: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(UserModel).values(
            {
                "id": user_id,
                "email": email,
            }
        )
    )


async def update_user_organization(
    user_id: str,
    organization_id: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(UserModel)
        .where(UserModel.id == user_id)
        .values(organization_id=organization_id)
    )


async def insert_organization(
    organization_id: str,
    name: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(OrganizationModel).values(id=organization_id, name=name)
    )


async def get_agent_documents(
    base_agent_id: SerializedUUID, db: async_scoped_session
) -> list[DocumentModel]:
    result = await db.execute(
        select(DocumentModel)
        .join(AgentDocumentModel)
        .where(AgentDocumentModel.base_agent_id == base_agent_id)
        .where(DocumentModel.id == AgentDocumentModel.document_id)
    )
    return list(result.scalars().all())


async def check_organization_owns_agent(
    agent_id: SerializedUUID,
    organization_id: str,
    db: async_scoped_session,
) -> bool:
    result = await db.execute(
        select(AgentModel)
        .where(AgentModel.id == agent_id)
        .where(AgentModel.organization_id == organization_id)
    )
    return result.scalar_one_or_none() is not None


async def get_analytics_groups(
    organization_id: str, db: async_scoped_session
) -> list[AnalyticsTagGroupModel]:
    result = await db.execute(
        select(AnalyticsTagGroupModel)
        .where(AnalyticsTagGroupModel.organization_id == organization_id)
        .options(selectinload(AnalyticsTagGroupModel.tags))
        .options(selectinload(AnalyticsTagGroupModel.reports))
    )
    return list(result.scalars().all())


async def get_analytics_report(
    report_id: SerializedUUID, db: async_scoped_session
) -> Optional[AnalyticsReportModel]:
    result = await db.execute(
        select(AnalyticsReportModel)
        .options(selectinload(AnalyticsReportModel.group))
        .where(AnalyticsReportModel.id == report_id)
    )
    return result.scalar_one_or_none()


async def make_agent_active(
    version_id: SerializedUUID,
    base_id: SerializedUUID,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(AgentModel)
        .where(AgentModel.base_id == base_id)
        .values(active=False)
    )
    await db.execute(
        update(AgentModel)
        .where(AgentModel.id == version_id)
        .values(active=True)
    )


async def get_user(
    user_id: SerializedUUID, db: async_scoped_session
) -> Optional[UserModel]:
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    return result.scalar_one_or_none()


async def update_agent_tool_configuration(
    agent_id: SerializedUUID,
    tool_configuration: dict,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(AgentModel)
        .where(AgentModel.id == agent_id)
        .values(tool_configuration=tool_configuration)
    )


async def insert_text_message_event(
    text_message_id: SerializedUUID,
    payload: dict,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(TextMessageEventModel).values(
            text_message_id=text_message_id, payload=payload
        )
    )


async def insert_text_message(
    agent_id: SerializedUUID,
    from_phone_number: str,
    to_phone_number: str,
    body: str,
    message_type: TextMessageType,
    message_sid: str,
    initiator: Optional[str],
    organization_id: str,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(TextMessageModel).values(
            agent_id=agent_id,
            from_phone_number=from_phone_number,
            to_phone_number=to_phone_number,
            body=body,
            message_type=message_type.value,
            message_sid=message_sid,
            initiator=initiator,
            organization_id=organization_id,
        )
    )
