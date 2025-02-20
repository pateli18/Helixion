import logging
from typing import Literal, Optional, Union, cast
from uuid import uuid4

from pydantic import BaseModel
from temporalio import activity

from src.db.api import (
    get_agent_workflow,
    insert_agent_workflow_event,
    insert_phone_call,
    insert_text_message,
    update_agent_workflow_status,
)
from src.db.base import async_session_scope
from src.helixion_types import (
    AgentWorkflowEventType,
    AgentWorkflowStatus,
    PhoneCallType,
    SerializedUUID,
    TextMessageType,
)
from src.settings import settings
from src.twilio_utils import create_call, send_text_message

logger = logging.getLogger(__name__)


class AgentWorkflowTextMessageConfig(BaseModel):
    type: Literal["text_message"]
    phone_number: str
    message_template: str

    def create_message(self, input_data: dict) -> str:
        return self.message_template.format(**input_data)


class AgentWorkflowPhoneCallConfig(BaseModel):
    type: Literal["phone_call"]
    agent_id: SerializedUUID
    phone_number: str


class AgentWorkflowWaitConfig(BaseModel):
    type: Literal["wait"]
    seconds: int


class AgentWorkflowConfig(BaseModel):
    config_blocks: list[
        Union[
            AgentWorkflowTextMessageConfig,
            AgentWorkflowPhoneCallConfig,
            AgentWorkflowWaitConfig,
        ]
    ]
    to_phone_number: str
    input_data: dict


class LoadAndValidateConfigInput(BaseModel):
    agent_workflow_id: SerializedUUID


@activity.defn(name="load_and_validate_config")
async def load_and_validate_config(
    input_: LoadAndValidateConfigInput,
) -> AgentWorkflowConfig:
    async with async_session_scope() as db:
        agent_workflow_model = await get_agent_workflow(
            input_.agent_workflow_id, db
        )
        if agent_workflow_model is None:
            raise ValueError(
                f"Agent workflow not found: {input_.agent_workflow_id}"
            )

        config_raw = agent_workflow_model.config
        config_blocks = []
        phone_numbers = set()
        for config_block in cast(list[dict], config_raw["config_blocks"]):
            if config_block["type"] == "text_message":
                if len(phone_numbers) == 0:
                    phone_numbers.add(config_block["phone_number"])
                elif config_block["phone_number"] not in phone_numbers:
                    raise ValueError(
                        f"Phone number {config_block['phone_number']} is not the same for all text message and phone call config blocks"
                    )
                config_blocks.append(
                    AgentWorkflowTextMessageConfig(
                        type=config_block["type"],
                        message_template=config_block["message_template"],
                        phone_number=config_block["phone_number"],
                    )
                )
            elif config_block["type"] == "phone_call":
                if len(phone_numbers) == 0:
                    phone_numbers.add(config_block["phone_number"])
                elif config_block["phone_number"] not in phone_numbers:
                    raise ValueError(
                        f"Phone number {config_block['phone_number']} is not the same for all text message and phone call config blocks"
                    )
                config_blocks.append(
                    AgentWorkflowPhoneCallConfig(
                        type=config_block["type"],
                        agent_id=config_block["agent_id"],
                        phone_number=config_block["phone_number"],
                    )
                )
            elif config_block["type"] == "wait":
                config_blocks.append(
                    AgentWorkflowWaitConfig(
                        type=config_block["type"],
                        seconds=config_block["seconds"],
                    )
                )

        config = AgentWorkflowConfig(
            config_blocks=config_blocks,
            to_phone_number=cast(str, agent_workflow_model.to_phone_number),
            input_data=cast(dict, agent_workflow_model.input_data),
        )

        return config


class ExecuteConfigBlockInput(BaseModel):
    config_block: Union[
        AgentWorkflowTextMessageConfig,
        AgentWorkflowPhoneCallConfig,
        AgentWorkflowWaitConfig,
    ]
    to_phone_number: str
    input_data: dict
    organization_id: str
    workflow_id: SerializedUUID


@activity.defn(name="execute_config_block")
async def execute_config_block(
    input_: ExecuteConfigBlockInput,
) -> Optional[int]:
    value_to_return = None
    async with async_session_scope() as db:
        if input_.config_block.type == "text_message":
            body = input_.config_block.create_message(input_.input_data)
            text_message_id = uuid4()
            from_phone_number = input_.config_block.phone_number
            to_phone_number = input_.to_phone_number
            text_message_sid = send_text_message(
                to_phone_number=to_phone_number,
                body=body,
                from_phone_number=from_phone_number,
                status_callback=f"https://{settings.host}/api/v1/phone/webhook/text-message-status/{text_message_id}",
            )
            text_message_id = await insert_text_message(
                agent_id=None,
                from_phone_number=from_phone_number,
                to_phone_number=to_phone_number,
                body=body,
                message_type=TextMessageType.outbound,
                message_sid=text_message_sid,
                initiator="texter",
                organization_id=input_.organization_id,
                db=db,
            )
            await insert_agent_workflow_event(
                agent_workflow_id=input_.workflow_id,
                event_type=AgentWorkflowEventType.outbound_text_message,
                event_link_id=text_message_id,
                metadata={},
                db=db,
            )
        elif input_.config_block.type == "phone_call":
            phone_call_id = uuid4()
            call_sid = create_call(
                to_phone_number=input_.to_phone_number,
                from_phone_number=input_.config_block.phone_number,
                phone_call_id=phone_call_id,
            )
            await insert_phone_call(
                id=phone_call_id,
                initiator="workflow",
                call_sid=call_sid,
                input_data=input_.input_data,
                from_phone_number=input_.config_block.phone_number,
                to_phone_number=input_.to_phone_number,
                agent_id=input_.config_block.agent_id,
                call_type=PhoneCallType.outbound,
                organization_id=input_.organization_id,
                db=db,
            )
            await insert_agent_workflow_event(
                agent_workflow_id=input_.workflow_id,
                event_type=AgentWorkflowEventType.outbound_phone_call,
                event_link_id=phone_call_id,
                metadata={},
                db=db,
            )
        elif input_.config_block.type == "wait":
            await insert_agent_workflow_event(
                agent_workflow_id=input_.workflow_id,
                event_type=AgentWorkflowEventType.wait,
                event_link_id=None,
                metadata={},
                db=db,
            )
            value_to_return = input_.config_block.seconds

    return value_to_return


class UpdateWorkflowStatusInput(BaseModel):
    agent_workflow_id: SerializedUUID


@activity.defn(name="update_workflow_status")
async def update_workflow_status(
    input_: UpdateWorkflowStatusInput,
) -> None:
    # TODO: update status in Monday
    async with async_session_scope() as db:
        await update_agent_workflow_status(
            agent_workflow_id=input_.agent_workflow_id,
            status=AgentWorkflowStatus.completed,
            db=db,
        )
