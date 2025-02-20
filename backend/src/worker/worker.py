from temporalio import worker

from src.settings import settings
from src.worker.worker_client.worker_client import (
    QUEUE_NAME,
    get_temporal_client,
)

from .sentry_interceptor import SentryInterceptor
from .workflows.agent_workflow.workflow import (
    AgentWorkflow,
    execute_config_block,
    load_and_validate_config,
    update_workflow_status,
)


async def start_worker():
    temporal_client = await get_temporal_client()

    interceptors = []
    if settings.sentry_dsn is not None:
        import sentry_sdk

        sentry_sdk.init(settings.sentry_dsn)
        interceptors.append(SentryInterceptor())

    temporal_worker = worker.Worker(
        temporal_client,
        task_queue=QUEUE_NAME,
        workflows=[AgentWorkflow],
        activities=[
            execute_config_block,
            load_and_validate_config,
            update_workflow_status,
        ],
        interceptors=interceptors,
    )
    await temporal_worker.run()
