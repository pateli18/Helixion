import asyncio
from typing import cast

from cachetools import LRUCache

from src.ai.api import send_openai_request
from src.db.api import get_documents_from_knowledge_bases
from src.db.base import async_session_scope
from src.helixion_types import (
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    SerializedUUID,
)

document_cache: LRUCache[
    SerializedUUID, list[tuple[SerializedUUID, str, str]]
] = LRUCache(maxsize=100)
document_cache_lock = asyncio.Lock()


async def _get_documents(
    knowledge_base_ids: list[SerializedUUID],
) -> list[tuple[str, str]]:
    docs: list[tuple[str, str]] = []
    seen_docs: set[SerializedUUID] = set()
    knowledge_bases_to_query = []
    for knowledge_base_id in knowledge_base_ids:
        if knowledge_base_id in document_cache:
            for doc_id, doc_name, doc_text in document_cache[
                knowledge_base_id
            ]:
                if doc_id not in seen_docs:
                    docs.append((doc_name, doc_text))
                    seen_docs.add(doc_id)
        else:
            knowledge_bases_to_query.append(knowledge_base_id)

    if len(knowledge_bases_to_query) > 0:
        async with async_session_scope() as db:
            documents = await get_documents_from_knowledge_bases(
                knowledge_base_ids, db
            )
            for document in documents:
                knowledge_base_id = cast(
                    SerializedUUID, document.knowledge_bases.knowledge_base_id
                )

                async with document_cache_lock:
                    if knowledge_base_id not in document_cache:
                        document_cache[knowledge_base_id] = []
                    doc_id = cast(SerializedUUID, document.id)
                    doc_name = cast(str, document.name)
                    doc_text = cast(str, document.text)
                    document_cache[knowledge_base_id].append(
                        (doc_id, doc_name, doc_text)
                    )
                    if doc_id not in seen_docs:
                        docs.append((doc_name, doc_text))
                        seen_docs.add(doc_id)

    return docs


async def _model_query_documents(
    query: str, documents: list[tuple[str, str]]
) -> str:
    system_prompt = """
- You are a helpful assistant that answers a user's question using the documents you have access to.
- Be concise and to the point
- You will be given a query and a set of documents.
- You will need to answer the query using the information in the documents only.
- If you cannot answer the query using the documents, you should say so
- Only return the answer, do not include any other text
"""

    documents_fmt = "\n".join(
        [f"#### {doc_name}\n{doc_text}" for doc_name, doc_text in documents]
    )
    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=system_prompt,
        ),
        ModelChat(
            role=ModelChatType.user,
            content=f"### Documents\n{documents_fmt}\n\n### Query\n{query}",
        ),
    ]

    model_payload = OpenAiChatInput(
        messages=model_chat,
        model=ModelType.gpt4o,
    )

    response = await send_openai_request(
        model_payload.data,
        "chat/completions",
    )

    return response["choices"][0]["message"]["content"]


async def query_documents(
    query: str, knowledge_base_ids: list[SerializedUUID]
) -> str:
    if len(knowledge_base_ids) == 0:
        return "No documents found"
    documents = await _get_documents(knowledge_base_ids)
    answer = await _model_query_documents(query, documents)
    return answer
