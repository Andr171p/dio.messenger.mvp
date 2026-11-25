from collections.abc import Awaitable, Callable

from .dtos import LinkPreviewDTO

type FetchLinkPreview = Callable[[str], Awaitable[LinkPreviewDTO]]

__all__ = ["FetchLinkPreview"]
