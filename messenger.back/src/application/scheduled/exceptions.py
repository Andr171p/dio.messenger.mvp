from ddf.application.exceptions import ApplicationError


class ScheduledMessageNotFoundError(ApplicationError):
    error_code = "scheduled_message_not_found"
    status_code = 404


class ScheduledMessageInvalidError(ApplicationError):
    error_code = "scheduled_message_invalid"
    status_code = 400
