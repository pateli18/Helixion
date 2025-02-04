from sqlalchemy import VARCHAR, Column

from src.db.base import Base
from src.db.mixins import TimestampMixin


class UserModel(Base, TimestampMixin):
    __tablename__ = "user"

    id = Column(
        VARCHAR,
        primary_key=True,
    )
    email = Column(VARCHAR, nullable=False)
    organization_id = Column(VARCHAR, nullable=False)


class OrganizationModel(Base, TimestampMixin):
    __tablename__ = "organization"

    id = Column(
        VARCHAR,
        primary_key=True,
    )
    name = Column(VARCHAR, nullable=False)
