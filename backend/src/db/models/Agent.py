from sqlalchemy import VARCHAR, Boolean, Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class AgentModel(Base, TimestampMixin):
    __tablename__ = "agent"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name = Column(VARCHAR, nullable=False)
    system_message = Column(VARCHAR, nullable=False)
    base_id = Column(UUID(as_uuid=True), nullable=False)
    active = Column(Boolean, nullable=False)
    sample_values = Column(JSONB, nullable=True)
    tool_configuration = Column(JSONB, nullable=True)
    user_id = Column(VARCHAR, ForeignKey("user.id"), nullable=False)
    organization_id = Column(
        VARCHAR, ForeignKey("organization.id"), nullable=False
    )

    phone_calls = relationship("PhoneCallModel", back_populates="agent")
    text_messages = relationship("TextMessageModel", back_populates="agent")
    user = relationship("UserModel")
    phone_numbers = relationship(
        "AgentPhoneNumberModel",
        back_populates="agents",
        primaryjoin="foreign(AgentPhoneNumberModel.base_agent_id) == AgentModel.base_id",
    )


class AgentPhoneNumberModel(Base, TimestampMixin):
    __tablename__ = "agent_phone_number"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    base_agent_id = Column(UUID(as_uuid=True), nullable=False)
    phone_number = Column(VARCHAR, nullable=False)
    incoming = Column(Boolean, nullable=False)

    agents = relationship(
        "AgentModel",
        back_populates="phone_numbers",
        primaryjoin="foreign(AgentPhoneNumberModel.base_agent_id) == AgentModel.base_id",
    )
