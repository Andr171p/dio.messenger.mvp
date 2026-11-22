from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.infra.database.repositories import SqlAlchemyConversationEventStore, SqlAlchemyMessageRepository


def get_message_repository(session: DBSession) -> MessageRepository:
    return SqlAlchemyMessageRepository(session)


def get_event_store(session: DBSession) -> ConversationEventStore:
    return SqlAlchemyConversationEventStore(session)


MessageRepositoryDep = Annotated[MessageRepository, Depends(get_message_repository)]
ConversationEventStoreDep = Annotated[ConversationEventStore, Depends(get_event_store)]
