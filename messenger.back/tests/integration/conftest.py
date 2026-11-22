"""Integration tests: real PostgreSQL via async SQLAlchemy."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from ddf.infra.database.sqlalchemy import PostgresConfig
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

_MESSENGER_BACK = Path(__file__).resolve().parents[2]
load_dotenv(_MESSENGER_BACK / ".env")


def _integration_requested() -> bool:
    if os.getenv("INTEGRATION") == "1":
        return True
    if os.getenv("DATABASE_URL"):
        return True
    return any(
        os.getenv(key)
        for key in (
            "POSTGRES_HOST",
            "POSTGRES_PORT",
            "POSTGRES_USERNAME",
            "POSTGRES_PASSWORD",
            "POSTGRES_DB",
        )
    )


def _async_database_uri() -> str:
    raw = os.getenv("DATABASE_URL")
    if raw:
        if raw.startswith("postgres://"):
            raw = raw.replace("postgres://", "postgresql://", 1)
        if raw.startswith("postgresql://") and "+asyncpg" not in raw:
            return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
        return raw
    return PostgresConfig().uri


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "integration: PostgreSQL-backed integration tests")


@pytest.fixture(scope="session")
def integration_enabled() -> bool:
    return _integration_requested()


@pytest_asyncio.fixture
async def integration_engine(integration_enabled: bool) -> AsyncIterator[AsyncEngine]:
    if not integration_enabled:
        pytest.skip("Integration tests disabled: set INTEGRATION=1 or configure POSTGRES_* / DATABASE_URL.")

    engine = create_async_engine(
        _async_database_uri(),
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=0,
    )
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"PostgreSQL is not reachable: {exc}")

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(integration_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with integration_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False, autoflush=False)
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


