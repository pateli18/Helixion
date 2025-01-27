import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.prompts import default_system_prompt
from src.ai.sample_values import generate_sample_values
from src.auth import auth
from src.db.api import get_agent, get_agents, insert_agent
from src.db.base import get_session
from src.db.converter import convert_agent_model
from src.helixion_types import Agent, AgentBase

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


class NewAgentVersionRequest(BaseModel):
    agent_base: AgentBase
    new_fields: list[str]


@router.post(
    "/new-version",
    response_model=Agent,
    dependencies=[Depends(auth.require_user)],
)
async def create_new_agent_version(
    request: NewAgentVersionRequest,
    db: async_scoped_session = Depends(get_session),
) -> Agent:
    if len(request.new_fields) > 0:
        new_field_sample_values = await generate_sample_values(
            request.new_fields
        )
        request.agent_base.sample_values = {
            **new_field_sample_values,
            **request.agent_base.sample_values,
        }
    new_agent_id = await insert_agent(request.agent_base, db)
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
            sample_values={},
            incoming_phone_number=None,
        ),
        db,
    )
    new_agent_model = await get_agent(agent_id, db)
    response = convert_agent_model(new_agent_model)
    await db.commit()
    return response


class SampleValuesRequest(BaseModel):
    fields: list[str]


@router.post(
    "/sample-values",
    response_model=dict,
    dependencies=[Depends(auth.require_user)],
)
async def get_sample_values(
    request: SampleValuesRequest,
) -> dict:
    if len(request.fields) == 0:
        return {}
    output = await generate_sample_values(request.fields)
    return output
