from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.reactions.repositories import ReactionRepository
from src.infra.database.repositories.reactions import SqlAlchemyReactionRepository


def get_reaction_repository(session: DBSession) -> ReactionRepository:
    return SqlAlchemyReactionRepository(session)


ReactionRepositoryDep = Annotated[ReactionRepository, Depends(get_reaction_repository)]

__all__ = ["ReactionRepositoryDep"]
