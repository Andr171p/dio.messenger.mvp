from fastapi import APIRouter

from . import itsm

router = APIRouter()
router.include_router(itsm.router)

__all__ = ["router"]
