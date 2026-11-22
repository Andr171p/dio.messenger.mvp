from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class MediaNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "media_not_found"


class MediaAccessDeniedError(ApplicationError):
    status_code = HTTPStatus.FORBIDDEN
    error_code = "media_access_denied"


class MediaPolicyViolationError(ApplicationError):
    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "media_policy_violation"
