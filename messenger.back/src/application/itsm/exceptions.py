from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class ItsmProviderError(ApplicationError):
    error_code = "itsm_provider_error"
    status_code = HTTPStatus.BAD_GATEWAY


class ItsmForbiddenError(ApplicationError):
    error_code = "itsm_forbidden"
    status_code = HTTPStatus.FORBIDDEN


class ItsmNotFoundError(ApplicationError):
    error_code = "itsm_not_found"
    status_code = HTTPStatus.NOT_FOUND


class ContextLinkConflictError(ApplicationError):
    error_code = "context_link_conflict"
    status_code = HTTPStatus.CONFLICT


class UnsupportedResourceError(ApplicationError):
    error_code = "unsupported_resource"
    status_code = HTTPStatus.BAD_REQUEST


class UnsupportedItsmActionError(ApplicationError):
    error_code = "unsupported_itsm_action"
    status_code = HTTPStatus.BAD_REQUEST
