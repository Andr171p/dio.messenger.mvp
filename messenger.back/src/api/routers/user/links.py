from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import HttpUrl

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.links import LinkPreviewDTO, link_preview_fetcher

router = APIRouter(tags=["links"])


@router.get(
    "/v1/link-preview",
    status_code=status.HTTP_200_OK,
    summary="Превью внешней ссылки (OpenGraph)",
)
async def get_link_preview(
    auth: CurrentUser,
    url: Annotated[HttpUrl, Query(description="Адрес публичной страницы")],
) -> LinkPreviewDTO:
    return await link_preview_fetcher.fetch(str(url))
