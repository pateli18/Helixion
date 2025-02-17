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
        back_populates="agent",
        primaryjoin="and_(foreign(AgentPhoneNumberModel.base_agent_id) == AgentModel.base_id, "
        "AgentModel.active == True)",
    )


class AgentPhoneNumberModel(Base, TimestampMixin):
    __tablename__ = "agent_phone_number"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    phone_number_sid = Column(VARCHAR, nullable=False)
    base_agent_id = Column(UUID(as_uuid=True), nullable=True)
    phone_number = Column(VARCHAR, nullable=False)
    incoming = Column(Boolean, nullable=False)
    organization_id = Column(
        VARCHAR, ForeignKey("organization.id"), nullable=False
    )

    agent = relationship(
        "AgentModel",
        back_populates="phone_numbers",
        primaryjoin="and_(foreign(AgentPhoneNumberModel.base_agent_id) == AgentModel.base_id, "
        "AgentModel.active == True)",
    )
