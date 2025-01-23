from src.ai.api import send_openai_request
from src.helixion_types import (
    Document,
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
)


async def query_documents(query: str, documents: list[Document]) -> str:
    system_prompt = f"""
- You are a helpful assistant that answers a user's question using the documents you have access to.
- Be concise and to the point
- You will be given a query and a set of documents.
- You will need to answer the query using the information in the documents only.
- If you cannot answer the query using the documents, you should say so
- Only return the answer, do not include any other text
"""

    documents_fmt = "\n".join(
        [f"#### {document.name}\n{document.text}" for document in documents]
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
