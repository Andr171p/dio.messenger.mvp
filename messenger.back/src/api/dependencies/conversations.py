from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.infra.database.repositories import SqlAlchemyConversationRepository, SqlAlchemyMembershipRepository


def get_conversation_repository(session: DBSession) -> ConversationRepository:
    return SqlAlchemyConversationRepository(session)


def get_membership_repository(session: DBSession) -> MembershipRepository:
    return SqlAlchemyMembershipRepository(session)


ConversationRepositoryDep = Annotated[ConversationRepository, Depends(get_conversation_repository)]
MembershipRepositoryDep = Annotated[MembershipRepository, Depends(get_membership_repository)]
