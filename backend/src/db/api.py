import logging
from typing import Optional

from sqlalchemy import Select, insert, or_, select, update
from sqlalchemy.ext.asyncio import async_scoped_session
from sqlalchemy.orm import joinedload, selectinload

from src.db.models import (
    AgentModel,
    AgentPhoneNumberModel,
    AgentWorkflowConfigModel,
    AgentWorkflowEventModel,
    AgentWorkflowModel,
    AnalyticsReportModel,
    AnalyticsTagGroupModel,
    DocumentModel,
    KnowledgeBaseDocumentAssociationModel,
    KnowledgeBaseModel,
    OrganizationModel,
    PhoneCallEventModel,
    PhoneCallModel,
    TextMessageEventModel,
    TextMessageModel,
    UserModel,
)
from src.helixion_types import (
    AgentBase,
    AgentMetadata,
    AgentWorkflowEventType,
    AgentWorkflowStatus,
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
        .options(selectinload(AgentModel.phone_numbers))
        .options(selectinload(AgentModel.user))
    )


async def get_agent(
    agent_id: SerializedUUID, db: async_scoped_session
) -> Optional[AgentModel]:
    query = _base_agent_query()
    result = await db.execute(query.where(AgentModel.id == agent_id))
    return result.scalar_one_or_none()


async def get_active_agent(
    base_id: SerializedUUID, db: async_scoped_session
) -> Optional[AgentModel]:
    query = _base_agent_query()
    result = await db.execute(
        query.where(AgentModel.base_id == base_id).where(
            AgentModel.active == True  # noqa E712
        )
    )
    return result.scalar_one_or_none()


async def get_agents(
    organization_id: str, db: async_scoped_session
) -> list[AgentModel]:
    result = await db.execute(
        select(AgentModel)
        .options(selectinload(AgentModel.user))
        .options(selectinload(AgentModel.phone_numbers))
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
    agent_id: Optional[SerializedUUID],
    from_phone_number: str,
    to_phone_number: str,
    body: str,
    message_type: TextMessageType,
    message_sid: str,
    initiator: Optional[str],
    organization_id: str,
    db: async_scoped_session,
) -> SerializedUUID:
    result = await db.execute(
        insert(TextMessageModel)
        .returning(TextMessageModel.id)
        .values(
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
    return result.scalar_one()


async def get_knowledge_base(
    knowledge_base_id: SerializedUUID,
    db: async_scoped_session,
) -> Optional[KnowledgeBaseModel]:
    result = await db.execute(
        select(KnowledgeBaseModel).where(
            KnowledgeBaseModel.id == knowledge_base_id
        )
    )
    return result.scalar_one_or_none()


async def get_knowledge_bases(
    organization_id: str,
    db: async_scoped_session,
) -> list[KnowledgeBaseModel]:
    result = await db.execute(
        select(KnowledgeBaseModel)
        .options(
            selectinload(KnowledgeBaseModel.documents)
            .joinedload(
                KnowledgeBaseDocumentAssociationModel.document,
            )
            .load_only(
                DocumentModel.id,  # type: ignore
                DocumentModel.name,  # type: ignore
                DocumentModel.mime_type,  # type: ignore
                DocumentModel.size,  # type: ignore
                DocumentModel.created_at,  # type: ignore
            )
        )
        .where(KnowledgeBaseModel.organization_id == organization_id)
    )
    return list(result.scalars())


async def insert_document(
    name: str,
    text: str,
    mime_type: str,
    size: int,
    storage_path: str,
    organization_id: str,
    token_count: int,
    db: async_scoped_session,
) -> DocumentModel:
    result = await db.execute(
        insert(DocumentModel)
        .returning(DocumentModel)
        .values(
            name=name,
            text=text,
            mime_type=mime_type,
            size=size,
            storage_path=storage_path,
            organization_id=organization_id,
            token_count=token_count,
        )
    )
    return result.scalar_one()


async def insert_document_knowledge_base_association(
    document_id: SerializedUUID,
    knowledge_base_id: SerializedUUID,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(KnowledgeBaseDocumentAssociationModel).values(
            document_id=document_id,
            knowledge_base_id=knowledge_base_id,
        )
    )


async def get_documents_from_knowledge_bases(
    knowledge_base_ids: list[SerializedUUID],
    db: async_scoped_session,
) -> list[DocumentModel]:
    result = await db.execute(
        select(DocumentModel)
        .distinct()
        .options(selectinload(DocumentModel.knowledge_bases))
        .join(KnowledgeBaseDocumentAssociationModel)
        .where(
            KnowledgeBaseDocumentAssociationModel.knowledge_base_id.in_(
                knowledge_base_ids
            )
        )
    )
    return list(result.scalars())


async def create_knowledge_base(
    name: str,
    organization_id: str,
    db: async_scoped_session,
) -> SerializedUUID:
    result = await db.execute(
        insert(KnowledgeBaseModel)
        .returning(KnowledgeBaseModel.id)
        .values(
            name=name,
            organization_id=organization_id,
        )
    )
    return result.scalar_one()


async def insert_phone_number(
    phone_number: str,
    phone_number_sid: str,
    organization_id: str,
    db: async_scoped_session,
) -> AgentPhoneNumberModel:
    result = await db.execute(
        insert(AgentPhoneNumberModel)
        .returning(AgentPhoneNumberModel)
        .values(
            phone_number=phone_number,
            phone_number_sid=phone_number_sid,
            organization_id=organization_id,
            incoming=False,
        )
    )
    return result.scalar_one()


async def assign_phone_number_to_agent(
    phone_number_id: SerializedUUID,
    agent_id: Optional[SerializedUUID],
    incoming: bool,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(AgentPhoneNumberModel)
        .where(AgentPhoneNumberModel.id == phone_number_id)
        .values(
            base_agent_id=agent_id,
            incoming=incoming,
        )
    )


async def get_agents_metadata(
    organization_id: str,
    db: async_scoped_session,
) -> list[AgentMetadata]:
    result = await db.execute(
        select(AgentModel.base_id, AgentModel.name, AgentModel.id)
        .where(AgentModel.active == True)  # noqa E712
        .where(AgentModel.organization_id == organization_id)
    )
    return [
        AgentMetadata(
            base_id=base_id,
            name=name,
            version_id=version_id,
        )
        for base_id, name, version_id in result
    ]


async def get_all_phone_numbers(
    organization_id: str,
    db: async_scoped_session,
) -> list[AgentPhoneNumberModel]:
    result = await db.execute(
        select(AgentPhoneNumberModel)
        .options(selectinload(AgentPhoneNumberModel.agent))
        .where(AgentPhoneNumberModel.organization_id == organization_id)
    )
    return list(result.scalars())


async def get_available_phone_numbers(
    existing_phone_number_ids: list[SerializedUUID],
    organization_id: str,
    db: async_scoped_session,
) -> list[AgentPhoneNumberModel]:
    result = await db.execute(
        select(AgentPhoneNumberModel)
        .where(
            or_(
                AgentPhoneNumberModel.id.in_(existing_phone_number_ids),
                AgentPhoneNumberModel.base_agent_id.is_(None),
            )
        )
        .where(AgentPhoneNumberModel.organization_id == organization_id)
    )
    return list(result.scalars())


async def get_phone_number(
    phone_number_id: SerializedUUID,
    db: async_scoped_session,
) -> Optional[AgentPhoneNumberModel]:
    result = await db.execute(
        select(AgentPhoneNumberModel)
        .options(selectinload(AgentPhoneNumberModel.agent))
        .where(AgentPhoneNumberModel.id == phone_number_id)
    )
    return result.scalar_one_or_none()


async def get_phone_number_sid_map(
    organization_id: str,
    db: async_scoped_session,
) -> dict[SerializedUUID, str]:
    result = await db.execute(
        select(
            AgentPhoneNumberModel.phone_number_sid, AgentPhoneNumberModel.id
        ).where(AgentPhoneNumberModel.organization_id == organization_id)
    )
    return {
        phone_number_id: phone_number_sid
        for phone_number_sid, phone_number_id in result
    }


async def get_agent_workflow(
    agent_workflow_id: SerializedUUID,
    db: async_scoped_session,
) -> Optional[AgentWorkflowModel]:
    result = await db.execute(
        select(AgentWorkflowModel).where(
            AgentWorkflowModel.id == agent_workflow_id
        )
    )
    return result.scalar_one_or_none()


async def insert_agent_workflow_event(
    agent_workflow_id: SerializedUUID,
    event_type: AgentWorkflowEventType,
    event_link_id: Optional[SerializedUUID],
    metadata: dict,
    db: async_scoped_session,
) -> None:
    await db.execute(
        insert(AgentWorkflowEventModel).values(
            agent_workflow_id=agent_workflow_id,
            event_type=event_type,
            event_link_id=event_link_id,
            metadata_=metadata,
        )
    )


async def update_agent_workflow_status(
    agent_workflow_id: SerializedUUID,
    status: AgentWorkflowStatus,
    db: async_scoped_session,
) -> None:
    await db.execute(
        update(AgentWorkflowModel)
        .where(AgentWorkflowModel.id == agent_workflow_id)
        .values(status=status.value)
    )


async def get_agent_workflow_by_phone_number(
    phone_number: str,
    organization_id: str,
    db: async_scoped_session,
) -> Optional[AgentWorkflowModel]:
    result = await db.execute(
        select(AgentWorkflowModel)
        .where(AgentWorkflowModel.to_phone_number == phone_number)
        .where(AgentWorkflowModel.organization_id == organization_id)
        .order_by(AgentWorkflowModel.created_at.desc())
    )

    latest_workflow = result.scalars().first()
    return latest_workflow


async def get_text_messages_from_workflow(
    workflow_id: SerializedUUID,
    db: async_scoped_session,
) -> list[TextMessageModel]:
    event_link_ids_raw = await db.execute(
        select(AgentWorkflowEventModel.event_link_id)
        .where(AgentWorkflowEventModel.agent_workflow_id == workflow_id)
        .where(
            or_(
                AgentWorkflowEventModel.event_type
                == AgentWorkflowEventType.inbound_text_message.value,
                AgentWorkflowEventModel.event_type
                == AgentWorkflowEventType.outbound_text_message.value,
            )
        )
    )
    event_link_ids = [event_link_id for event_link_id, in event_link_ids_raw]

    result = await db.execute(
        select(TextMessageModel)
        .where(TextMessageModel.id.in_(event_link_ids))
        .order_by(TextMessageModel.created_at.asc())
    )
    return list(result.scalars())


async def insert_agent_workflow(
    config: dict,
    input_data: dict,
    to_phone_number: str,
    organization_id: str,
    db: async_scoped_session,
) -> SerializedUUID:
    result = await db.execute(
        insert(AgentWorkflowModel)
        .returning(AgentWorkflowModel.id)
        .values(
            config=config,
            input_data=input_data,
            to_phone_number=to_phone_number,
            organization_id=organization_id,
            status=AgentWorkflowStatus.pending.value,
        )
    )
    return result.scalar_one()


async def get_agent_workflow_config(
    agent_workflow_id: SerializedUUID,
    db: async_scoped_session,
) -> Optional[AgentWorkflowConfigModel]:
    result = await db.execute(
        select(AgentWorkflowConfigModel).where(
            AgentWorkflowConfigModel.agent_workflow_id == agent_workflow_id
        )
    )
    return result.scalar_one_or_none()
