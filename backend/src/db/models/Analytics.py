from sqlalchemy import VARCHAR, Column, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class AnalyticsTagGroupModel(Base, TimestampMixin):
    __tablename__ = "analytics_tag_group"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name = Column(VARCHAR, nullable=False)
    organization_id = Column(
        VARCHAR,
        ForeignKey("organization.id"),
        nullable=False,
    )

    tags = relationship("AnalyticsTagModel", back_populates="group")
    reports = relationship("AnalyticsReportModel", back_populates="group")


class AnalyticsTagModel(Base, TimestampMixin):
    __tablename__ = "analytics_tag"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analytics_tag_group.id"),
        nullable=False,
    )
    tag = Column(VARCHAR, nullable=False)
    phone_call_id = Column(
        UUID(as_uuid=True), ForeignKey("phone_call.id"), nullable=False
    )

    phone_call = relationship("PhoneCallModel")
    group = relationship("AnalyticsTagGroupModel", back_populates="tags")


class AnalyticsReportModel(Base, TimestampMixin):
    __tablename__ = "analytics_report"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("analytics_tag_group.id"),
        nullable=False,
    )
    name = Column(VARCHAR, nullable=False)
    text = Column(VARCHAR, nullable=False)

    group = relationship("AnalyticsTagGroupModel", back_populates="reports")
