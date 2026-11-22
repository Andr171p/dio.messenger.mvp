from http import HTTPStatus

from ddf.domain.exceptions import DomainError


class MessageAlreadyDeletedError(DomainError):
    status_code = HTTPStatus.CONFLICT
    error_code = "message_already_deleted"
