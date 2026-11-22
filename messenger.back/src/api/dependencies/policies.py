from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.policies.repositories import ConversationPolicyRepository
from src.infra.database.repositories import SqlAlchemyConversationPolicyRepository


def get_conversation_policy_repository(session: DBSession) -> ConversationPolicyRepository:
    return SqlAlchemyConversationPolicyRepository(session)


ConversationPolicyRepositoryDep = Annotated[
    ConversationPolicyRepository,
    Depends(get_conversation_policy_repository),
]
