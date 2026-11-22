from fastapi import APIRouter

from . import connection

router = APIRouter()
router.include_router(connection.router)

__all__ = ["router"]
