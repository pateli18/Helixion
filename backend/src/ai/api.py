import logging

import httpx

from src.settings import settings

logger = logging.getLogger(__name__)


TIMEOUT = 180


async def _core_send_request(
    url: str,
    headers: dict,
    request_payload: dict,
) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers=headers,
            json=request_payload,
            timeout=httpx.Timeout(TIMEOUT),
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
) -> dict:
    url = f"https://api.openai.com/v1/{route}"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    response_output = await _core_send_request(
        url,
        headers,
        request_payload,
    )
    return response_output
