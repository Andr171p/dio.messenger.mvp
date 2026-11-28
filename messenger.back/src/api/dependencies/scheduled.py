from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.scheduled.repositories import ScheduledMessageRepository
from src.infra.database.repositories.scheduled import SqlAlchemyScheduledMessageRepository


def get_scheduled_repository(session: DBSession) -> ScheduledMessageRepository:
    return SqlAlchemyScheduledMessageRepository(session)


ScheduledMessageRepositoryDep = Annotated[ScheduledMessageRepository, Depends(get_scheduled_repository)]

__all__ = ["ScheduledMessageRepositoryDep"]
