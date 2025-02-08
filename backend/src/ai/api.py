import logging
from typing import Optional

import httpx

from src.settings import settings

logger = logging.getLogger(__name__)


TIMEOUT = 180

model_client = httpx.AsyncClient()


async def _core_send_request(
    url: str,
    request_params: dict,
) -> dict:
    response = await model_client.post(
        url,
        **request_params,
    )
    if response.status_code != 200:
        response_body = await response.aread()
        response_text = response_body.decode()
        logger.warning(response_text)
    response.raise_for_status()
    response_output = response.json()
    return response_output


async def send_openai_request(
    request_payload: dict,
    route: str,
    files: Optional[dict] = None,
    data: Optional[dict] = None,
    timeout: int = TIMEOUT,
) -> dict:
    url = f"https://api.openai.com/v1/{route}"
    request_params = {
        "headers": {"Authorization": f"Bearer {settings.openai_api_key}"},
        "timeout": httpx.Timeout(timeout),
    }
    if request_payload:
        request_params["json"] = request_payload
    if files:
        request_params["files"] = files
    if data:
        request_params["data"] = data

    response_output = await _core_send_request(
        url,
        request_params,
    )
    return response_output
