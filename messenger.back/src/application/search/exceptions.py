from ddf.domain.exceptions import DomainError


class SearchQueryInvalidError(DomainError):
    """Search parameters cannot be executed safely."""


class SearchQueryTooShortError(SearchQueryInvalidError):
    pass