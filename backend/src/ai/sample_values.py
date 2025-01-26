import json

from src.ai.api import send_openai_request
from src.ai.prompts import sample_values_prompt
from src.helixion_types import (
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    ResponseType,
)


async def generate_sample_values(fields: list[str]) -> dict:
    fmt_payload = "\n".join([f"- {field}" for field in fields])

    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=sample_values_prompt,
        ),
        ModelChat(
            role=ModelChatType.user,
            content=fmt_payload,
        ),
    ]

    model_payload = OpenAiChatInput(
        messages=model_chat,
        model=ModelType.gpt4o_mini,
        response_format=ResponseType(),
    )

    response = await send_openai_request(
        model_payload.data,
        "chat/completions",
    )

    output = json.loads(response["choices"][0]["message"]["content"])
    return output
