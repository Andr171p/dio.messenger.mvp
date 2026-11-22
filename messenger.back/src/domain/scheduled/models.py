from typing import Any

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ddf.domain.models import Entity

from .types import ScheduledMessageStatus


@dataclass(kw_only=True)
class ScheduledMessage(Entity):
    conversation_id: UUID
    organization_id: UUID
    sender_id: UUID
    payload: dict[str, Any]
    send_at: datetime
    status: ScheduledMessageStatus = ScheduledMessageStatus.PENDING
    client_message_id: UUID

    def mark_sent(self) -> None:
        self.status = ScheduledMessageStatus.SENT

    def mark_cancelled(self) -> None:
        if self.status is not ScheduledMessageStatus.PENDING:
            raise ValueError("Only pending scheduled messages can be cancelled.")
        self.status = ScheduledMessageStatus.CANCELLED