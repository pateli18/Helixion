import logging
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.prompts import default_system_prompt
from src.db.api import get_agents, insert_agent
from src.db.base import get_session
from src.helixion_types import Agent, AgentBase

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    include_in_schema=False,
    responses={404: {"description": "Not found"}},
)


@router.get("/all", response_model=list[Agent])
async def retrieve_all_agents(
    db: async_scoped_session = Depends(get_session),
) -> list[Agent]:
    agents = await get_agents(db)
    return [Agent.model_validate(agent) for agent in agents]


@router.post("/new-version", response_model=Agent)
async def create_new_agent_version(
    request: AgentBase,
    db: async_scoped_session = Depends(get_session),
) -> Agent:
    new_agent_model = await insert_agent(request, db)
    response = Agent.model_validate(new_agent_model)
    await db.commit()
    return response


class NewAgentRequest(BaseModel):
    name: str


@router.post("/new-agent", response_model=Agent)
async def create_agent(
    request: NewAgentRequest,
    db: async_scoped_session = Depends(get_session),
) -> Agent:
    base_id = uuid4()
    agent_model = await insert_agent(
        AgentBase(
            name=request.name,
            system_message=default_system_prompt,
            base_id=base_id,
            active=True,
        ),
        db,
    )
    await db.commit()
    return Agent.model_validate(agent_model)
