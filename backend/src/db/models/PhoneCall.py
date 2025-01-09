from sqlalchemy import VARCHAR, Column, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from src.db.base import Base
from src.db.mixins import TimestampMixin


class PhoneCallModel(Base, TimestampMixin):
    __tablename__ = "phone_call"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    call_sid = Column(VARCHAR, nullable=False)
    input_data = Column(JSONB, nullable=False)
    call_data = Column(VARCHAR, nullable=True)
    output_data = Column(JSONB, nullable=True)
