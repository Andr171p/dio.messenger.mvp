from ddf.domain.exceptions import DomainError


class ThreadNotFoundError(DomainError):
    error_code = "thread_not_found"
    status_code = 404


class ThreadInvalidError(DomainError):
    error_code = "thread_invalid"
    status_code = 400
