from sqlalchemy import VARCHAR, Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class PhoneCallEventModel(Base, TimestampMixin):
    __tablename__ = "phone_call_event"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    payload = Column(JSONB, nullable=False)
    phone_call_id = Column(
        UUID(as_uuid=True), ForeignKey("phone_call.id"), nullable=False
    )
    phone_call = relationship("PhoneCallModel", back_populates="events")


class PhoneCallModel(Base, TimestampMixin):
    __tablename__ = "phone_call"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agent.id"), nullable=False
    )
    call_sid = Column(VARCHAR, nullable=False)
    input_data = Column(JSONB, nullable=False)
    call_data = Column(VARCHAR, nullable=True)
    from_phone_number = Column(VARCHAR, nullable=False)
    to_phone_number = Column(VARCHAR, nullable=False)
    end_reason = Column(VARCHAR, nullable=True)

    events = relationship("PhoneCallEventModel", back_populates="phone_call")
    agent = relationship("AgentModel", back_populates="phone_calls")
