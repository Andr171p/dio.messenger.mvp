from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import Entity


@dataclass(kw_only=True)
class ContextLink(Entity):
    """Связь беседы с внешним ITSM-объектом (без копии aggregate)."""

    organization_id: UUID
    conversation_id: UUID
    provider: str
    resource_type: str
    resource_id: str
    created_by: UUID
