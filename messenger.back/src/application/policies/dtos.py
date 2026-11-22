from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt
from pydantic.alias_generators import to_camel


class ConversationPolicyDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    conversation_id: UUID
    allow_external_members: bool
    allow_forwarding: bool
    allow_attachments: bool
    allow_ai: bool
    max_attachment_bytes: NonNegativeInt
    message_edit_window_seconds: NonNegativeInt
    version: NonNegativeInt


class UpdateConversationPolicyDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    allow_external_members: bool | None = None
    allow_forwarding: bool | None = None
    allow_attachments: bool | None = None
    allow_ai: bool | None = None
    max_attachment_bytes: int | None = Field(default=None, ge=0)
    message_edit_window_seconds: int | None = Field(default=None, ge=0)
