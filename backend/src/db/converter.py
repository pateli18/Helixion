from typing import cast

from src.db.models import PhoneCallModel
from src.helixion_types import (
    AgentMetadata,
    PhoneCallMetadata,
    PhoneCallStatus,
    SerializedUUID,
)


def convert_phone_call_model(phone_call: PhoneCallModel) -> PhoneCallMetadata:
    # get latest event status
    if len(phone_call.events) == 0:
        event_payload = {
            "CallStatus": PhoneCallStatus.queued,
            "CallDuration": None,
        }
    else:
        latest_event = sorted(
            phone_call.events,
            key=lambda event: int(event.payload["SequenceNumber"]),
        )[-1]
        event_payload = latest_event.payload

    return PhoneCallMetadata(
        id=cast(SerializedUUID, phone_call.id),
        from_phone_number=cast(str, phone_call.from_phone_number),
        to_phone_number=cast(str, phone_call.to_phone_number),
        input_data=cast(dict, phone_call.input_data),
        status=event_payload["CallStatus"],
        created_at=phone_call.created_at,
        duration=event_payload.get("CallDuration"),
        recording_available=phone_call.call_data is not None,
        agent_metadata=AgentMetadata(
            base_id=phone_call.agent.base_id,
            name=phone_call.agent.name,
            version_id=phone_call.agent.id,
        ),
    )
