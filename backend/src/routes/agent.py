import logging
from typing import cast
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import async_scoped_session

from src.ai.instructions_update import (
    generate_updated_instructions_from_report,
)
from src.ai.prompts import default_system_prompt
from src.ai.sample_values import generate_sample_values
from src.auth import User, require_user
from src.db.api import (
    assign_phone_number_to_agent,
    get_agent,
    get_agents,
    get_agents_metadata,
    get_all_phone_numbers,
    get_analytics_report,
    insert_agent,
    insert_phone_number,
    make_agent_active,
    update_agent_tool_configuration,
)
from src.db.base import get_session
from src.db.converter import convert_agent_model, convert_agent_phone_number
from src.helixion_types import (
    Agent,
    AgentBase,
    AgentMetadata,
    AgentPhoneNumber,
    SerializedUUID,
    TransferCallNumber,
)
from src.twilio_utils import available_phone_numbers

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    responses={404: {"description": "Not found"}},
)


@router.get(
    "/all",
    response_model=list[Agent],
    dependencies=[Depends(require_user)],
)
async def retrieve_all_agents(
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> list[Agent]:
    agents = await get_agents(cast(str, user.active_org_id), db)
    return [convert_agent_model(agent) for agent in agents]


@router.get(
    "/metadata/all",
    response_model=list[AgentMetadata],
    dependencies=[Depends(require_user)],
)
async def get_all_agent_metadata(
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> list[AgentMetadata]:
    return await get_agents_metadata(cast(str, user.active_org_id), db)


class NewAgentVersionRequest(BaseModel):
    agent_base: AgentBase
    new_fields: list[str]


@router.post(
    "/new-version",
    response_model=Agent,
)
async def create_new_agent_version(
    request: NewAgentVersionRequest,
    user: User = Depends(require_user),
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
    new_agent_id = await insert_agent(
        request.agent_base,
        user.user_id,
        cast(str, user.active_org_id),
        db,
    )
    new_agent_model = await get_agent(new_agent_id, db)
    response = convert_agent_model(new_agent_model)
    await db.commit()
    return response


class NewAgentRequest(BaseModel):
    name: str


@router.post(
    "/new-agent",
    response_model=Agent,
)
async def create_agent(
    request: NewAgentRequest,
    user: User = Depends(require_user),
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
            tool_configuration={"hang_up": True},
        ),
        user.user_id,
        cast(str, user.active_org_id),
        db,
    )
    new_agent_model = await get_agent(agent_id, db)
    response = convert_agent_model(new_agent_model)
    await db.commit()
    return response


class KnowledgeBaseMetadata(BaseModel):
    id: SerializedUUID
    name: str


class UpdateToolConfigurationRequest(BaseModel):
    hang_up: bool
    send_text: bool
    transfer_call_numbers: list[TransferCallNumber]
    enter_keypad: bool
    knowledge_bases: list[KnowledgeBaseMetadata]


@router.post(
    "/update-tool-configuration/{agent_id}",
    response_model=dict,
)
async def update_tool_configuration(
    agent_id: SerializedUUID,
    request: UpdateToolConfigurationRequest,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> dict:
    agent = await get_agent(agent_id, db)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if cast(str, agent.organization_id) != user.active_org_id:
        raise HTTPException(status_code=403, detail="Agent not found")

    # format the tool configuration
    tool_configuration = {
        "hang_up": request.hang_up,
        "send_text": request.send_text,
        "transfer_call_numbers": [
            item.model_dump() for item in request.transfer_call_numbers
        ],
        "enter_keypad": request.enter_keypad,
        "knowledge_bases": [
            item.model_dump() for item in request.knowledge_bases
        ],
    }
    await update_agent_tool_configuration(agent_id, tool_configuration, db)
    await db.commit()
    return tool_configuration


class SampleValuesRequest(BaseModel):
    fields: list[str]


@router.post(
    "/sample-values",
    response_model=dict,
    dependencies=[Depends(require_user)],
)
async def get_sample_values(
    request: SampleValuesRequest,
) -> dict:
    if len(request.fields) == 0:
        return {}
    output = await generate_sample_values(request.fields)
    return output


class UpdateInstructionsFromReportResponse(BaseModel):
    base_id: SerializedUUID
    version_id: SerializedUUID


@router.post(
    "/update-instructions-from-report/{agent_id}/{report_id}",
    response_model=UpdateInstructionsFromReportResponse,
)
async def update_instructions_from_report(
    agent_id: SerializedUUID,
    report_id: SerializedUUID,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> UpdateInstructionsFromReportResponse:
    agent = await get_agent(agent_id, db)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if cast(str, agent.organization_id) != user.active_org_id:
        raise HTTPException(status_code=403, detail="Agent not found")
    report = await get_analytics_report(report_id, db)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.group.organization_id != user.active_org_id:
        raise HTTPException(status_code=403, detail="Report not found")
    updated_instructions = await generate_updated_instructions_from_report(
        cast(str, agent.system_message), cast(str, report.text)
    )
    base_id = cast(SerializedUUID, agent.base_id)
    new_agent_id = await insert_agent(
        AgentBase(
            name=cast(str, agent.name),
            system_message=updated_instructions,
            base_id=base_id,
            active=False,
            sample_values=cast(dict, agent.sample_values),
            tool_configuration=cast(dict, agent.tool_configuration),
        ),
        user.user_id,
        cast(str, user.active_org_id),
        db,
    )
    await db.commit()
    return UpdateInstructionsFromReportResponse(
        base_id=base_id,
        version_id=new_agent_id,
    )


@router.post(
    "/activate-version/{version_id}",
    status_code=204,
)
async def activate_version(
    version_id: SerializedUUID,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
):
    agent = await get_agent(version_id, db)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if cast(str, agent.organization_id) != user.active_org_id:
        raise HTTPException(
            status_code=403, detail="You do not have access to this agent"
        )
    await make_agent_active(
        version_id, cast(SerializedUUID, agent.base_id), db
    )
    await db.commit()
    return Response(status_code=204)


@router.get(
    "/phone-number/all",
    response_model=list[AgentPhoneNumber],
    dependencies=[Depends(require_user)],
)
async def get_all_numbers(
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> list[AgentPhoneNumber]:
    phone_numbers = await get_all_phone_numbers(str(user.active_org_id), db)
    return [
        convert_agent_phone_number(
            phone_number,
            phone_number.agents[0] if len(phone_number.agents) > 0 else None,
        )
        for phone_number in phone_numbers
    ]


@router.get(
    "/phone-number/available/{country_code}/{area_code}",
    response_model=list[str],
    dependencies=[Depends(require_user)],
)
async def get_available_phone_numbers(
    country_code: str,
    area_code: int,
) -> list[str]:
    return available_phone_numbers(country_code, area_code)


class BuyPhoneNumberRequest(BaseModel):
    phone_number: str


@router.post(
    "/phone-number/buy",
    response_model=AgentPhoneNumber,
)
async def buy_phone_number(
    request: BuyPhoneNumberRequest,
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> AgentPhoneNumber:
    agent_phone_number_model = await insert_phone_number(
        request.phone_number,
        cast(str, user.active_org_id),
        db,
    )
    output = AgentPhoneNumber(
        id=cast(SerializedUUID, agent_phone_number_model.id),
        phone_number=cast(str, agent_phone_number_model.phone_number),
        incoming=cast(bool, agent_phone_number_model.incoming),
        agent=None,
    )
    await db.commit()
    return output


class AssignPhoneNumberRequest(BaseModel):
    phone_number_id: SerializedUUID
    agent_base_id: SerializedUUID
    incoming: bool


@router.post("/phone-number/assign", status_code=204)
async def assign_phone_number(
    request: AssignPhoneNumberRequest,
    db: async_scoped_session = Depends(get_session),
):
    await assign_phone_number_to_agent(
        request.phone_number_id,
        request.agent_base_id,
        request.incoming,
        db,
    )
    await db.commit()
    return Response(status_code=204)
