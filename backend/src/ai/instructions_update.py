from src.ai.api import send_openai_request
from src.helixion_types import (
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    Prediction,
)


async def generate_updated_instructions_from_report(
    instructions: str, report: str
) -> str:
    system_prompt = """
- You are given a `report` of an analysis of previous calls and `instructions` for an AI call agent
- Your task is to update the `instructions` based on the `report`
- Do not remove instructions unless they directly contradict the report
- Only return the updated `instructions`, do not include any other text
"""
    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=system_prompt,
        ),
        ModelChat(
            role=ModelChatType.user,
            content=f"### Report\n{report}\n\n### Instructions\n{instructions}",
        ),
    ]

    model_payload = OpenAiChatInput(
        messages=model_chat,
        model=ModelType.gpt4o,
        prediction=Prediction(content=instructions),
    )

    response = await send_openai_request(
        model_payload.data,
        "chat/completions",
    )

    return response["choices"][0]["message"]["content"]
