from ddf.application.exceptions import ApplicationError


class PollNotFoundError(ApplicationError):
    error_code = "poll_not_found"
    status_code = 404


class PollInvalidError(ApplicationError):
    error_code = "poll_invalid"
    status_code = 400


class PollClosedError(ApplicationError):
    error_code = "poll_closed"
    status_code = 409
