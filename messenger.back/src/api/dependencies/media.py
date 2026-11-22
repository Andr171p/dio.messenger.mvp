from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.media.repositories import MediaRepository
from src.infra.database.repositories import SqlAlchemyMediaRepository


def get_media_repository(session: DBSession) -> MediaRepository:
    return SqlAlchemyMediaRepository(session)


MediaRepositoryDep = Annotated[MediaRepository, Depends(get_media_repository)]

__all__ = ["MediaRepositoryDep"]
