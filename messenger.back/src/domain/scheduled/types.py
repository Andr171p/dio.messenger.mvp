from enum import StrEnum


class ScheduledMessageStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    CANCELLED = "cancelled"