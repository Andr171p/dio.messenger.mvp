from ddf.domain.exceptions import DomainError


class ConversationArchivedError(DomainError):
    error_code = "conversation_archived"


class DirectConversationExistsError(DomainError):
    error_code = "direct_conversation_exists"
