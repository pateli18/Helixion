import asyncio
import io
import logging
from typing import cast

import docx2txt
import pymupdf
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.auth import User, require_user
from src.aws_utils import S3Client
from src.db.api import (
    create_knowledge_base,
    get_knowledge_base,
    get_knowledge_bases,
    insert_document,
    insert_document_knowledge_base_association,
)
from src.db.base import get_session
from src.db.converter import convert_knowledge_base_model
from src.helixion_types import DocumentMetadata, KnowledgeBase, SerializedUUID

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/knowledge-base",
    tags=["knowledge-base"],
    responses={404: {"description": "Not found"}},
)


def _doc_save_path(organization_id: str, filename: str) -> str:
    return (
        f"s3://helixion-knowledge-bases/documents/{organization_id}/{filename}"
    )


@router.post(
    "/upload/{knowledge_base_id}", response_model=list[DocumentMetadata]
)
async def upload_documents(
    files: list[UploadFile],
    knowledge_base_id: SerializedUUID,
    db: async_scoped_session = Depends(get_session),
    user: User = Depends(require_user),
) -> list[DocumentMetadata]:
    knowledge_base_model = await get_knowledge_base(knowledge_base_id, db)
    if knowledge_base_model is None:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if cast(str, knowledge_base_model.organization_id) != user.active_org_id:
        raise HTTPException(status_code=403, detail="Knowledge base not found")

    file_data: list[tuple[str, bytes, str]] = [
        (
            file.filename or f"document_{i}",
            await file.read(),
            file.content_type or "application/octet-stream",
        )
        for i, file in enumerate(files)
    ]

    async with S3Client() as s3:
        await asyncio.gather(
            *[
                s3.upload_file(
                    data,
                    _doc_save_path(str(user.active_org_id), filename),
                    mime_type,
                )
                for filename, data, mime_type in file_data
            ]
        )

    documents = []
    for filename, data, mime_type in file_data:
        if mime_type == "application/pdf":
            pdf_reader = pymupdf.open("pdf", io.BytesIO(data))
            pages_text = []
            for page in pdf_reader:  # type: ignore
                pages_text.append(page.get_text())  # type: ignore
            text = "\n\n".join(pages_text)
        elif mime_type == "text/plain":
            text = data.decode("utf-8")
        elif (
            mime_type
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            text = docx2txt.process(io.BytesIO(data))
        else:
            logger.warning(f"Cannot process file type {mime_type}")
            text = ""

        document_model = await insert_document(
            name=filename,
            text=text,
            mime_type=mime_type,
            size=len(data),
            storage_path=_doc_save_path(str(user.active_org_id), filename),
            organization_id=str(user.active_org_id),
            db=db,
        )
        await insert_document_knowledge_base_association(
            document_id=cast(SerializedUUID, document_model.id),
            knowledge_base_id=knowledge_base_id,
            db=db,
        )
        documents.append(DocumentMetadata.model_validate(document_model))

    await db.commit()
    return documents


@router.get("/all", response_model=list[KnowledgeBase])
async def all_knowledge_bases(
    db: async_scoped_session = Depends(get_session),
    user: User = Depends(require_user),
) -> list[KnowledgeBase]:
    knowledge_base_models = await get_knowledge_bases(
        str(user.active_org_id), db
    )
    return [
        convert_knowledge_base_model(knowledge_base_model)
        for knowledge_base_model in knowledge_base_models
    ]


class CreateKnowledgeBaseRequest(BaseModel):
    name: str


@router.post("/create", response_model=KnowledgeBase)
async def create_kb(
    request: CreateKnowledgeBaseRequest,
    db: async_scoped_session = Depends(get_session),
    user: User = Depends(require_user),
) -> KnowledgeBase:
    knowledge_base_id = await create_knowledge_base(
        request.name, str(user.active_org_id), db
    )
    return KnowledgeBase(
        id=knowledge_base_id,
        name=request.name,
        documents=[],
    )
