"""
Media lifecycle worker: ``uploaded`` → scan/validate → ``ready`` | ``rejected``.

Запуск: ``python -m src.infra.media.worker``.
Несколько экземпляров безопасны (``FOR UPDATE SKIP LOCKED``).
"""

import asyncio
import logging

from ddf.infra.database.sqlalchemy import PostgresConfig
from ddf.infra.s3 import S3Client, S3Config

from src.application.media.config import MediaConfig
from src.application.media.processing import process_uploaded_asset
from src.infra.database.connection import create_database
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.media.config import MediaWorkerConfig

logger = logging.getLogger(__name__)


async def _process_batch(
    *,
    sessionmaker,
    storage: S3Client,
    media_config: MediaConfig,
    batch_size: int,
) -> int:
    async with sessionmaker() as session:
        repo = SqlAlchemyMediaRepository(session)
        claimed = await repo.claim_for_scanning(limit=batch_size)
        await session.commit()

    if not claimed:
        return 0

    processed = 0
    for asset in claimed:
        async with sessionmaker() as session:
            repo = SqlAlchemyMediaRepository(session)
            fresh = await repo.read(asset.id)
            if fresh is None:
                continue
            try:
                await process_uploaded_asset(
                    fresh,
                    storage=storage,
                    media_repository=repo,
                    config=media_config,
                )
                await session.commit()
                processed += 1
                logger.info(
                    "Media asset %s → %s",
                    fresh.id,
                    fresh.status.value,
                )
            except Exception:
                await session.rollback()
                logger.exception("Failed to process media asset %s", asset.id)
    return processed


async def run_media_worker() -> None:
    pg_config = PostgresConfig()
    engine, sessionmaker = create_database(pg_config)
    worker_config = MediaWorkerConfig()
    media_config = MediaConfig()
    storage = S3Client(S3Config())

    logger.info("Media lifecycle worker started (poll_interval=%ss)", worker_config.poll_interval)

    try:
        while True:
            count = await _process_batch(
                sessionmaker=sessionmaker,
                storage=storage,
                media_config=media_config,
                batch_size=worker_config.batch_size,
            )
            if count == 0:
                await asyncio.sleep(worker_config.poll_interval)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_media_worker())
