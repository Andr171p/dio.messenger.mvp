from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class ReactionNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "reaction_not_found"


class ReactionInvalidError(ApplicationError):
    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "reaction_invalid"
