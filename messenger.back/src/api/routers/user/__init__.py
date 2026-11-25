from fastapi import APIRouter

from . import (
    audit,
    conversations,
    itsm,
    links,
    media,
    messages,
    pins,
    polls,
    reactions,
    scheduled,
    search,
    sync,
    threads,
    ws_tickets,
)

router = APIRouter()
router.include_router(audit.router)
router.include_router(conversations.router)
router.include_router(conversations.catalog_router)
router.include_router(messages.router)
router.include_router(media.router)
router.include_router(reactions.router)
router.include_router(pins.router)
router.include_router(threads.router)
router.include_router(polls.router)
router.include_router(scheduled.router)
router.include_router(search.router)
router.include_router(sync.router)
router.include_router(ws_tickets.router)
router.include_router(itsm.router)
router.include_router(links.router)

__all__ = ["router"]
