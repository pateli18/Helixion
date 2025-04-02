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

document_cache: LRUCache[str, list[tuple[str, str, int]]] = LRUCache(
    maxsize=15
)
document_cache_lock = asyncio.Lock()


async def _get_documents(
    knowledge_base_ids: list[SerializedUUID],
) -> list[tuple[str, str, int]]:
    document_cache_key = "-".join(
        sorted([str(kb_id) for kb_id in knowledge_base_ids])
    )
    if document_cache_key not in document_cache:
        async with async_session_scope() as db:
            document_models = await get_documents_from_knowledge_bases(
                knowledge_base_ids, db
            )
            async with document_cache_lock:
                document_cache[document_cache_key] = [
                    (
                        cast(str, document_model.name),
                        cast(str, document_model.text),
                        cast(int, document_model.token_count),
                    )
                    for document_model in document_models
                ]
    return document_cache[document_cache_key]


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


async def _consolidate_answers(query: str, answers: list[str]) -> str:
    system_prompt = """
- You are a helpful assistant that answers a user's question using answers from subsets of documents.
- Be concise and to the point
- You will be given a query and a set of answers.
- You will need to answer the query using the information in the answers only.
- If you cannot answer the query using the answers, you should say so
- Only return the answer, do not include any other text
"""

    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=system_prompt,
        ),
        ModelChat(
            role=ModelChatType.user,
            content=f"### Query\n{query}\n\n### Answers\n{answers}",
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


def _group_documents_by_token_count(
    documents: list[tuple[str, str, int]], max_tokens: int
) -> list[list[tuple[str, str]]]:
    document_groups: list[list[tuple[str, str]]] = []
    current_group: list[tuple[str, str]] = []
    current_token_count = 0

    for doc_name, doc_text, token_count in documents:
        if current_token_count + token_count > max_tokens and current_group:
            document_groups.append(current_group)
            current_group = []
            current_token_count = 0

        current_group.append((doc_name, doc_text))
        current_token_count += token_count

    if current_group:
        document_groups.append(current_group)

    return document_groups


MAX_TOKEN_AMOUNT = 30000


async def query_documents(query: str, knowledge_bases: list[dict]) -> str:
    if len(knowledge_bases) == 0:
        return "No documents found"

    documents = await _get_documents(
        [cast(SerializedUUID, kb["id"]) for kb in knowledge_bases]
    )
    documents = sorted(documents, key=lambda x: x[2])

    document_groups = _group_documents_by_token_count(
        documents, MAX_TOKEN_AMOUNT
    )

    # Process all groups in parallel
    answers = await asyncio.gather(
        *[_model_query_documents(query, group) for group in document_groups]
    )

    consolidated_answer = await _consolidate_answers(query, answers)

    return consolidated_answer
