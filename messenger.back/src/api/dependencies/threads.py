from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.threads.repositories import ThreadRepository
from src.infra.database.repositories.threads import SqlAlchemyThreadRepository


def get_thread_repository(session: DBSession) -> ThreadRepository:
    return SqlAlchemyThreadRepository(session)


ThreadRepositoryDep = Annotated[ThreadRepository, Depends(get_thread_repository)]

__all__ = ["ThreadRepositoryDep"]
