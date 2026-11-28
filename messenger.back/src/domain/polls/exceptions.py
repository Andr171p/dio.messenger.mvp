from ddf.domain.exceptions import DomainError


class PollClosedError(DomainError):
    error_code = "poll_closed"
    status_code = 409


class PollInvalidError(DomainError):
    error_code = "poll_invalid"
    status_code = 400


class PollNotFoundError(DomainError):
    error_code = "poll_not_found"
    status_code = 404


class PollVoteNotAllowedError(DomainError):
    error_code = "poll_vote_not_allowed"
    status_code = 403
