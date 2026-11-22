from fastapi import APIRouter, status
from fastapi.responses import PlainTextResponse

from src.infra.observability.metrics import METRICS

router = APIRouter(prefix="/v1/system", tags=["system"])


@router.get(
    "/metrics",
    status_code=status.HTTP_200_OK,
    summary="Prometheus text metrics (in-process registry)",
    response_class=PlainTextResponse,
)
async def get_metrics() -> PlainTextResponse:
    return PlainTextResponse(
        content=METRICS.render_prometheus(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )