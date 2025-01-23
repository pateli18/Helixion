import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.api import send_openai_request
from src.ai.prompts import default_system_prompt, sample_details_prompt
from src.auth import auth
from src.db.api import get_agent, get_agents, insert_agent
from src.db.base import get_session
from src.db.converter import convert_agent_model
from src.helixion_types import (
    Agent,
    AgentBase,
    ModelChat,
    ModelChatType,
    ModelType,
    OpenAiChatInput,
    ResponseType,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    responses={404: {"description": "Not found"}},
)


@router.get(
    "/all",
    response_model=list[Agent],
    dependencies=[Depends(auth.require_user)],
)
async def retrieve_all_agents(
    db: async_scoped_session = Depends(get_session),
) -> list[Agent]:
    agents = await get_agents(db)
    return [convert_agent_model(agent) for agent in agents]


@router.post(
    "/new-version",
    response_model=Agent,
    dependencies=[Depends(auth.require_user)],
)
async def create_new_agent_version(
    request: AgentBase,
    db: async_scoped_session = Depends(get_session),
) -> Agent:
    new_agent_id = await insert_agent(request, db)
    new_agent_model = await get_agent(new_agent_id, db)
    response = convert_agent_model(new_agent_model)
    await db.commit()
    return response


class NewAgentRequest(BaseModel):
    name: str


@router.post(
    "/new-agent",
    response_model=Agent,
    dependencies=[Depends(auth.require_user)],
)
async def create_agent(
    request: NewAgentRequest,
    db: async_scoped_session = Depends(get_session),
) -> Agent:
    base_id = uuid4()
    agent_id = await insert_agent(
        AgentBase(
            name=request.name,
            system_message=default_system_prompt,
            base_id=base_id,
            active=True,
        ),
        db,
    )
    new_agent_model = await get_agent(agent_id, db)
    response = convert_agent_model(new_agent_model)
    await db.commit()
    return response


class SampleDetailsRequest(BaseModel):
    fields: list[str]


@router.post(
    "/sample-details",
    response_model=dict,
    dependencies=[Depends(auth.require_user)],
)
async def sample_details(
    request: SampleDetailsRequest,
) -> dict:

    fmt_payload = "\n".join([f"- {field}" for field in request.fields])

    model_chat = [
        ModelChat(
            role=ModelChatType.system,
            content=sample_details_prompt,
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
