from typing import Optional, cast

from sqlalchemy import inspect

from src.db.models import (
    AgentModel,
    AgentPhoneNumberModel,
    AnalyticsTagGroupModel,
    KnowledgeBaseModel,
    PhoneCallModel,
)
from src.helixion_types import (
    Agent,
    AgentMetadata,
    AgentPhoneNumber,
    AnalyticsGroup,
    AnalyticsReport,
    AnalyticsTag,
    DocumentMetadata,
    KnowledgeBase,
    PhoneCallEndReason,
    PhoneCallMetadata,
    PhoneCallStatus,
    PhoneCallType,
    SerializedUUID,
)


def latest_phone_call_event(phone_call: PhoneCallModel) -> Optional[dict]:
    if len(phone_call.events) == 0:
        return None
    # filter out media stream events
    relevant_events = [
        event
        for event in phone_call.events
        if event.payload.get("CallStatus") is not None
    ]
    if len(relevant_events) == 0:
        return None
    return sorted(
        relevant_events,
        key=lambda event: int(event.payload["SequenceNumber"]),
    )[-1].payload


def convert_phone_call_model(phone_call: PhoneCallModel) -> PhoneCallMetadata:
    # get latest event status
    event_payload = latest_phone_call_event(phone_call)
    if event_payload is None:
        event_payload = {
            "CallStatus": PhoneCallStatus.queued,
            "CallDuration": None,
        }

    if phone_call.agent_id is None:
        agent_metadata = None
    else:
        agent_metadata = AgentMetadata(
            base_id=phone_call.agent.base_id,
            name=phone_call.agent.name,
            version_id=phone_call.agent.id,
        )

    return PhoneCallMetadata(
        id=cast(SerializedUUID, phone_call.id),
        from_phone_number=cast(str, phone_call.from_phone_number),
        to_phone_number=cast(str, phone_call.to_phone_number),
        input_data=cast(dict, phone_call.input_data),
        status=event_payload["CallStatus"],
        created_at=phone_call.created_at,
        duration=event_payload.get("CallDuration"),
        recording_available=phone_call.call_data is not None,
        agent_metadata=agent_metadata,
        call_type=cast(PhoneCallType, phone_call.call_type),
        end_reason=cast(Optional[PhoneCallEndReason], phone_call.end_reason),
        initiator=cast(Optional[str], phone_call.initiator),
    )


def convert_agent_phone_number(
    agent_phone_number: AgentPhoneNumberModel,
) -> AgentPhoneNumber:
    inspector = inspect(agent_phone_number)
    has_loaded_agent = "agent" not in inspector.unloaded
    return AgentPhoneNumber(
        id=cast(SerializedUUID, agent_phone_number.id),
        phone_number=cast(str, agent_phone_number.phone_number),
        incoming=cast(bool, agent_phone_number.incoming),
        agent=(
            AgentMetadata(
                base_id=cast(SerializedUUID, agent_phone_number.agent.base_id),
                name=cast(str, agent_phone_number.agent.name),
                version_id=cast(SerializedUUID, agent_phone_number.agent.id),
            )
            if has_loaded_agent and agent_phone_number.agent is not None
            else None
        ),
    )


def convert_agent_model(agent: AgentModel) -> Agent:
    return Agent(
        base_id=cast(SerializedUUID, agent.base_id),
        name=cast(str, agent.name),
        id=cast(SerializedUUID, agent.id),
        created_at=agent.created_at,
        system_message=cast(str, agent.system_message),
        active=cast(bool, agent.active),
        sample_values=cast(Optional[dict], agent.sample_values) or {},
        user_email=cast(str, agent.user.email),
        tool_configuration=cast(Optional[dict], agent.tool_configuration)
        or {},
        phone_numbers=[
            convert_agent_phone_number(item) for item in agent.phone_numbers
        ],
    )


def convert_analytics_tag_group_model(
    tag_group: AnalyticsTagGroupModel,
) -> AnalyticsGroup:
    return AnalyticsGroup(
        id=cast(SerializedUUID, tag_group.id),
        name=cast(str, tag_group.name),
        tags=[
            AnalyticsTag(
                id=tag.id,
                tag=tag.tag,
                phone_call_id=tag.phone_call_id,
            )
            for tag in tag_group.tags
        ],
        reports=[
            AnalyticsReport(
                id=report.id,
                name=report.name,
                text=report.text,
            )
            for report in tag_group.reports
        ],
    )


def convert_knowledge_base_model(
    knowledge_base: KnowledgeBaseModel,
) -> KnowledgeBase:
    return KnowledgeBase(
        id=cast(SerializedUUID, knowledge_base.id),
        name=cast(str, knowledge_base.name),
        documents=[
            DocumentMetadata.model_validate(document.document)
            for document in knowledge_base.documents
        ],
    )
