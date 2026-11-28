from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class PinNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "pin_not_found"
