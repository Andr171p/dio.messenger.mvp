from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AuditEventDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    id: UUID
    organization_id: UUID
    actor_id: UUID
    action: str
    conversation_id: UUID | None
    resource_type: str
    resource_id: str
    summary: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime