from sqlalchemy import VARCHAR, Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class AgentWorkflowEventModel(Base, TimestampMixin):
    __tablename__ = "agent_workflow_event"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    agent_workflow_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agent_workflow.id"),
        nullable=False,
    )
    event_type = Column(VARCHAR, nullable=False)
    event_link_id = Column(
        UUID(as_uuid=True),
        nullable=True,
    )
    metadata_ = Column(JSONB, nullable=False)

    agent_workflow = relationship(
        "AgentWorkflowModel", back_populates="events"
    )


class AgentWorkflowModel(Base, TimestampMixin):
    __tablename__ = "agent_workflow"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    config = Column(JSONB, nullable=False)
    input_data = Column(JSONB, nullable=False)
    to_phone_number = Column(VARCHAR, nullable=False)
    status = Column(VARCHAR, nullable=False)
    organization_id = Column(
        VARCHAR,
        ForeignKey("organization.id"),
        nullable=False,
    )

    events = relationship(
        "AgentWorkflowEventModel",
        back_populates="agent_workflow",
    )
