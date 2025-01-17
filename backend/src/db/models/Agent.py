from sqlalchemy import VARCHAR, Boolean, Column, text
from sqlalchemy.dialects.postgresql import UUID
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

    phone_calls = relationship("PhoneCallModel", back_populates="agent")
