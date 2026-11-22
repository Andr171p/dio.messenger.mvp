from http import HTTPStatus

from ddf.domain.exceptions import DomainError


class MediaNotReadyError(DomainError):
    status_code = HTTPStatus.CONFLICT
    error_code = "media_not_ready"


class InvalidMediaTransitionError(DomainError):
    status_code = HTTPStatus.CONFLICT
    error_code = "invalid_media_transition"
