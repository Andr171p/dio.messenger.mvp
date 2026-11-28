# syntax=docker/dockerfile:1
FROM python:3.14-slim-trixie AS dependencies
COPY --from=ghcr.io/astral-sh/uv:0.11.1 /uv /usr/local/bin/uv

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY messenger.back/pyproject.toml messenger.back/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project

FROM python:3.14-slim-trixie AS runtime
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN groupadd --gid 10001 messenger \
    && useradd --uid 10001 --gid messenger --no-create-home messenger
COPY --from=dependencies /app/.venv ./.venv

FROM runtime AS backend
COPY messenger.back/alembic.ini ./
COPY messenger.back/migrations ./migrations
COPY messenger.back/src ./src
USER messenger
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002", "--no-access-log", "--log-level", "warning"]

FROM runtime AS media
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY messenger.back/src ./src
USER messenger
CMD ["python", "-m", "src.infra.media.worker"]
