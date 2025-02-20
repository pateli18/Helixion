import asyncio
import logging
from datetime import timedelta

from temporalio import workflow

from src.helixion_types import AgentWorkflowInput

with workflow.unsafe.imports_passed_through():
    from .activities import (
        ExecuteConfigBlockInput,
        LoadAndValidateConfigInput,
        UpdateWorkflowStatusInput,
        execute_config_block,
        load_and_validate_config,
        update_workflow_status,
    )

logger = logging.getLogger(__name__)


@workflow.defn(name="AgentWorkflow")
class AgentWorkflow:
    @workflow.run
    async def run(
        self,
        input_: AgentWorkflowInput,
    ) -> None:

        workflow_config = await workflow.execute_activity(
            load_and_validate_config,
            LoadAndValidateConfigInput(
                agent_workflow_id=input_.id,
            ),
            start_to_close_timeout=timedelta(seconds=60),
        )

        self._block_pointer = 0

        while self._block_pointer < len(workflow_config.config_blocks):
            output = await workflow.execute_activity(
                execute_config_block,
                ExecuteConfigBlockInput(
                    config_block=workflow_config.config_blocks[
                        self._block_pointer
                    ],
                    to_phone_number=workflow_config.to_phone_number,
                    input_data=workflow_config.input_data,
                    organization_id=input_.organization_id,
                    workflow_id=input_.id,
                ),
                start_to_close_timeout=timedelta(seconds=60),
            )
            self._block_pointer += 1

            # wait x amount of time if needed
            if output is not None:
                await asyncio.sleep(output)

        await workflow.execute_activity(
            update_workflow_status,
            UpdateWorkflowStatusInput(
                agent_workflow_id=input_.id,
            ),
            start_to_close_timeout=timedelta(seconds=60),
        )
