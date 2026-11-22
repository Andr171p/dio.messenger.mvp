from ddf.domain.exceptions import DomainError


class ScheduledMessageNotFoundError(DomainError):
    error_code = "scheduled_message_not_found"
    status_code = 404


class ScheduledMessageInvalidError(DomainError):
    error_code = "scheduled_message_invalid"
    status_code = 400