from sqlalchemy import VARCHAR, Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class TextMessageEventModel(Base, TimestampMixin):
    __tablename__ = "text_message_event"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    payload = Column(JSONB, nullable=False)
    text_message_id = Column(
        UUID(as_uuid=True), ForeignKey("text_message.id"), nullable=False
    )
    text_message = relationship("TextMessageModel", back_populates="events")


class TextMessageModel(Base, TimestampMixin):
    __tablename__ = "text_message"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    agent_id = Column(
        UUID(as_uuid=True), ForeignKey("agent.id"), nullable=True
    )
    from_phone_number = Column(VARCHAR, nullable=False)
    to_phone_number = Column(VARCHAR, nullable=False)
    body = Column(VARCHAR, nullable=False)
    message_type = Column(VARCHAR, nullable=False)
    message_sid = Column(VARCHAR, nullable=False)
    initiator = Column(VARCHAR, nullable=True)
    organization_id = Column(
        VARCHAR,
        ForeignKey("organization.id"),
        nullable=False,
    )

    events = relationship(
        "TextMessageEventModel", back_populates="text_message"
    )
    agent = relationship("AgentModel", back_populates="text_messages")
