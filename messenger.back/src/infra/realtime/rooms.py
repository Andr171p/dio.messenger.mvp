from uuid import UUID

from ddf.application.realtime import Room


def user_room(*, organization_id: UUID, user_id: UUID) -> Room:
    return Room(f"user:{organization_id}:{user_id}")


def conversation_room(conversation_id: UUID) -> Room:
    return Room(f"conversation:{conversation_id}")
