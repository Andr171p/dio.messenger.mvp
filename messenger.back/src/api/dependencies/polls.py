from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.polls.repositories import PollRepository
from src.infra.database.repositories.polls import SqlAlchemyPollRepository


def get_poll_repository(session: DBSession) -> PollRepository:
    return SqlAlchemyPollRepository(session)


PollRepositoryDep = Annotated[PollRepository, Depends(get_poll_repository)]

__all__ = ["PollRepositoryDep"]