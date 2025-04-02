from sqlalchemy import VARCHAR, Column, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from src.db.base import Base
from src.db.mixins import TimestampMixin


class DocumentModel(Base, TimestampMixin):
    __tablename__ = "document"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name = Column(VARCHAR, nullable=False)
    text = Column(VARCHAR, nullable=False)
    mime_type = Column(VARCHAR, nullable=False)
    size = Column(Integer, nullable=False)
    token_count = Column(Integer, nullable=False)
    storage_path = Column(VARCHAR, nullable=False)
    organization_id = Column(
        VARCHAR, ForeignKey("organization.id"), nullable=False
    )

    knowledge_bases = relationship(
        "KnowledgeBaseDocumentAssociationModel",
        back_populates="document",
    )


class KnowledgeBaseDocumentAssociationModel(Base, TimestampMixin):
    __tablename__ = "knowledge_base_document_association"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    knowledge_base_id = Column(
        UUID(as_uuid=True), ForeignKey("knowledge_base.id"), nullable=False
    )
    document_id = Column(
        UUID(as_uuid=True), ForeignKey("document.id"), nullable=False
    )
    document = relationship("DocumentModel", back_populates="knowledge_bases")
    knowledge_base = relationship(
        "KnowledgeBaseModel", back_populates="documents"
    )


class KnowledgeBaseModel(Base, TimestampMixin):
    __tablename__ = "knowledge_base"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    name = Column(VARCHAR, nullable=False)
    organization_id = Column(
        VARCHAR, ForeignKey("organization.id"), nullable=False
    )

    documents = relationship(
        "KnowledgeBaseDocumentAssociationModel",
        back_populates="knowledge_base",
    )
