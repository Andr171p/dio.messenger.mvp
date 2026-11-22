from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class ConversationNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "conversation_not_found"


class IdempotencyConflictError(ApplicationError):
    status_code = HTTPStatus.CONFLICT
    error_code = "idempotency_conflict"
