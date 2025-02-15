import logging

from fastapi import Depends, HTTPException
from propelauth_fastapi import init_auth
from propelauth_py.user import User

from src.settings import settings

logger = logging.getLogger(__name__)

_auth = init_auth(settings.auth_url, settings.auth_api_key)


def require_user(user: User = Depends(_auth.require_user)) -> User:
    org_map = user.org_id_to_org_member_info
    if org_map is None:
        raise HTTPException(
            status_code=403, detail="User is not a member of any organization"
        )
    return user
