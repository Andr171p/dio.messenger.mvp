from ddf.application.exceptions import ApplicationError


class ThreadNotFoundError(ApplicationError):
    error_code = "thread_not_found"
    status_code = 404


class ThreadInvalidError(ApplicationError):
    error_code = "thread_invalid"
    status_code = 400
