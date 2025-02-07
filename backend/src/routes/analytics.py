import logging
from typing import cast

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import async_scoped_session

from src.auth import User, require_user
from src.db.api import get_analytics_groups
from src.db.base import get_session
from src.db.converter import convert_analytics_tag_group_model
from src.helixion_types import AnalyticsGroup

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    responses={404: {"description": "Not found"}},
)


@router.get(
    "/groups",
    response_model=list[AnalyticsGroup],
    dependencies=[Depends(require_user)],
)
async def retrieve_all_analytics_groups(
    user: User = Depends(require_user),
    db: async_scoped_session = Depends(get_session),
) -> list[AnalyticsGroup]:
    groups = await get_analytics_groups(cast(str, user.active_org_id), db)
    return [convert_analytics_tag_group_model(group) for group in groups]
