import logging
from datetime import timedelta
from typing import Any, Optional, Union
from uuid import uuid4

from pydantic import BaseModel
from temporalio import client, exceptions

from src.settings import settings

from .pydantic_data_converter import pydantic_data_converter

logger = logging.getLogger(__name__)

QUEUE_NAME = "signup-verification"


async def get_temporal_client() -> client.Client:
    host = settings.temporal_host
    additional_kwargs: dict[str, Any] = {
        "data_converter": pydantic_data_converter,
    }
    if settings.temporal_api_key is not None:
        additional_kwargs = {
            **additional_kwargs,
            "namespace": settings.temporal_namespace,
            "api_key": settings.temporal_api_key,
            "rpc_metadata": {
                "temporal-namespace": settings.temporal_namespace
            },
            "tls": True,
        }

    return await client.Client.connect(
        host,
        **additional_kwargs,
    )


async def execute_workflow(
    workflow: str,
    workflow_input: Optional[Union[dict, BaseModel]],
    task_queue: str,
    workflow_id: Optional[str] = None,
    execution_timeout: Optional[timedelta] = None,
    existing_ok: bool = False,
) -> client.WorkflowHandle:
    temporal_client = await get_temporal_client()

    workflow_id_to_use = workflow_id or str(uuid4())
    kwargs: dict[str, Any] = {
        "workflow": workflow,
        "task_queue": task_queue,
        "id": workflow_id_to_use,
        "execution_timeout": execution_timeout,
    }

    if workflow_input is not None:
        kwargs["arg"] = workflow_input

    try:
        handle = await temporal_client.start_workflow(**kwargs)
    except exceptions.WorkflowAlreadyStartedError as e:
        if existing_ok:
            handle = await get_workflow_handle(workflow_id_to_use)
        else:
            raise e

    return handle


async def get_workflow_handle(
    workflow_id: str,
) -> client.WorkflowHandle:
    temporal_client = await get_temporal_client()
    handle = temporal_client.get_workflow_handle(workflow_id=workflow_id)

    return handle


async def cancel_workflow(workflow_id: str) -> bool:
    handle = await get_workflow_handle(workflow_id)

    description = await handle.describe()
    if description.status == client.WorkflowExecutionStatus.COMPLETED:
        already_completed = True
    else:
        already_completed = False

    await handle.cancel()

    return already_completed


async def send_workflow_signal(
    workflow_id: str, signal_name: str, signal: BaseModel
) -> None:
    handle = await get_workflow_handle(workflow_id)
    await handle.signal(signal_name, signal)


async def send_workflow_query(workflow_id: str, query_name: str) -> Any:
    handle = await get_workflow_handle(workflow_id)
    output = await handle.query(query_name)
    return output
