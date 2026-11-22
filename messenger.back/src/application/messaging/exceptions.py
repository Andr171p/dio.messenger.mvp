from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class MessageNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "message_not_found"


class IdempotencyConflictError(ApplicationError):
    status_code = HTTPStatus.CONFLICT
    error_code = "idempotency_conflict"


class SnapshotRequiredError(ApplicationError):
    status_code = HTTPStatus.CONFLICT
    error_code = "snapshot_required"


class EmptyMessageError(ApplicationError):
    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "empty_message"


class MessageContentInvalidError(ApplicationError):
    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "message_content_invalid"


class MessageEditWindowExpiredError(ApplicationError):
    status_code = HTTPStatus.CONFLICT
    error_code = "message_edit_window_expired"
