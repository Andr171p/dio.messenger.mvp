from typing import Any, Literal

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.application.itsm.constants import DEFAULT_SUGGESTED_PRIORITY, DEFAULT_SUGGESTED_TICKET_TYPE


class ResourceReference(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    provider: str = Field(min_length=1, max_length=64)
    resource_type: str = Field(min_length=1, max_length=64)
    resource_id: str = Field(min_length=1, max_length=128)


class ResourceAttachmentDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    filename: str
    content_type: str
    size: int
    id: UUID | None = None


class ResourceAttachmentAccessDTO(BaseModel):
    url: str


class ResourceActivityDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    action: str
    occurred_at: datetime


class ResourcePreviewDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    ref: ResourceReference
    number: str
    title: str
    status: str
    priority: str
    ticket_type: str | None = None
    assignee_display_name: str | None = None
    assignee_id: UUID | None = None
    access: Literal["full", "limited", "denied"] = "full"
    description: str | None = None
    updated_at: datetime | None = None
    attachments: list[ResourceAttachmentDTO] | None = None
    activity: list[ResourceActivityDTO] | None = None


class ContextLinkDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    organization_id: UUID
    provider: str
    resource_type: str
    resource_id: str
    created_by: UUID


class CreateContextLinkDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    provider: str = Field(min_length=1, max_length=64)
    resource_type: str = Field(min_length=1, max_length=64)
    resource_id: str = Field(min_length=1, max_length=128)


class ResourceActionRequestDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    ref: ResourceReference
    action: Literal["start_progress", "assign", "resolve", "close", "reopen"]
    conversation_id: UUID | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class ResourceActionResultDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    ref: ResourceReference
    action: str
    status: str
    number: str
    title: str


class CreateTicketFromChatDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=10_000)
    ticket_type: str = Field(min_length=1, max_length=64)
    priority: str = "medium"
    client_request_id: UUID | None = None
    post_resource_message: bool = True


class CreateTicketFromChatResultDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    ticket_id: UUID
    number: str
    link: ContextLinkDTO
    message_id: UUID | None = None


class ProvisionContextConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    organization_id: UUID
    context: ResourceReference
    title: str | None = None
    member_ids: list[UUID] = Field(default_factory=list)
    created_by: UUID
    priority: str | int | None = None


class TicketSuggestionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversation_id: UUID
    message_id: UUID
    suggested: bool
    title: str | None = None
    description: str | None = None
    ticket_type: str = DEFAULT_SUGGESTED_TICKET_TYPE
    priority: str = DEFAULT_SUGGESTED_PRIORITY


class ConfirmTicketSuggestionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=10_000)
    ticket_type: str | None = Field(default=None, min_length=1, max_length=64)
    priority: str | None = None
    client_request_id: UUID | None = None
    post_resource_message: bool = True


class ProvisionContextConversationResultDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversation_id: UUID
    created: bool
    link: ContextLinkDTO
