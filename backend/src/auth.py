import logging

from propelauth_fastapi import init_auth

from src.settings import settings

logger = logging.getLogger(__name__)

auth = init_auth(settings.auth_url, settings.auth_api_key)
