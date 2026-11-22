from fastapi import APIRouter

from . import service, system, user, websocket

router = APIRouter()
router.include_router(user.router)
router.include_router(service.router)
router.include_router(websocket.router)
router.include_router(system.router)

__all__ = ["router"]
