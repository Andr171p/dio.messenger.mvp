"""ASGI-приложение DIO Messenger. Запуск: ``uvicorn src.main:app``."""

import logging

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware

from src.api.config import CorsConfig
from src.api.exception_handlers import register_exception_handlers
from src.api.lifespan import lifespan
from src.api.middleware import WsContainerMiddleware
from src.api.realtime_runtime import ws_container
from src.api.routers import router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="DIO Messenger",
    version="0.1.0",
    lifespan=lifespan,
)

cors = CorsConfig()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors.origins,
    allow_credentials=cors.allow_credentials,
    allow_methods=cors.allow_methods,
    allow_headers=cors.allow_headers,
)
app.add_middleware(WsContainerMiddleware, container=ws_container)
app.include_router(router)
register_exception_handlers(app)


@app.get("/health/live", status_code=status.HTTP_200_OK, tags=["Health"], summary="Liveness")
async def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", status_code=status.HTTP_200_OK, tags=["Health"], summary="Readiness")
async def health_ready() -> dict[str, str]:
    return {"status": "ok"}
