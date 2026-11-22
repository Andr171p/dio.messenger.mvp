from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from ddf.domain.models import Entity


@dataclass(kw_only=True)
class AuditEvent(Entity):
    organization_id: UUID
    actor_id: UUID
    action: str
    conversation_id: UUID | None
    resource_type: str
    resource_id: str
    summary: dict[str, Any] = field(default_factory=dict)