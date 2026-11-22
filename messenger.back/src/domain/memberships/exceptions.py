from ddf.domain.exceptions import DomainError


class MemberNotFoundError(DomainError):
    error_code = "member_not_found"


class MemberAlreadyActiveError(DomainError):
    error_code = "member_already_active"
