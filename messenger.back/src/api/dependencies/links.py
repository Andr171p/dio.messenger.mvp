from src.application.links.config import LinkPreviewConfig
from src.application.links.dtos import LinkPreviewDTO
from src.application.links.types import FetchLinkPreview
from src.infra.links.http import HttpLinkPreviewFetcher

link_preview_config = LinkPreviewConfig()
link_preview_fetcher = HttpLinkPreviewFetcher(link_preview_config)

__all__ = ["FetchLinkPreview", "LinkPreviewDTO", "link_preview_fetcher"]
