from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.search.repositories import MessageSearchRepository
from src.infra.database.repositories.search import SqlAlchemyMessageSearchRepository


def get_message_search_repository(session: DBSession) -> MessageSearchRepository:
    return SqlAlchemyMessageSearchRepository(session)


MessageSearchRepositoryDep = Annotated[MessageSearchRepository, Depends(get_message_search_repository)]
