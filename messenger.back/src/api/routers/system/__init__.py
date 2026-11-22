from fastapi import APIRouter

from . import metrics

router = APIRouter()
router.include_router(metrics.router)

__all__ = ["router"]
