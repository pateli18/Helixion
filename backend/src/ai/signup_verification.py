from typing import Literal

from src.ai.api import send_openai_request
from src.helixion_types import (
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    TextMessage,
    TextMessageType,
)


async def signup_verification_status_prompt(
    message_history: list[TextMessage],
) -> Literal["verified", "not_interested", "not_relevant"]:
    system_prompt = """
- You are are given a `message history` of a conversation between a user and yourself (an AI agent)
- Your task is to respond to the user's message
   - The user's message should indicate either that:
     - They are interested in participating in the study
        - In this case you should return `verified`
     - They are not interested in participating in the study
        - In this case you should return `not_interested`
   - If the user's message is off topic from the above, return `not_relevant`
- Only return the `status` in your response, do not include any other text
"""

    message_history_str = "\n----\n".join(
        [
            f"**{message.message_type == TextMessageType.inbound and 'User' or 'AI Agent'}**: {message.body}"
            for message in message_history
        ]
    )

    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=system_prompt,
        ),
        ModelChat(
            role=ModelChatType.user,
            content=message_history_str,
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

    status = response["choices"][0]["message"]["content"].strip("`")

    if status not in ["verified", "not_interested", "not_relevant"]:
        raise ValueError(f"Invalid status: {status}")

    return status
