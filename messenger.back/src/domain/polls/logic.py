from uuid import UUID, uuid4

from .exceptions import PollInvalidError
from .models import Poll, PollOption

_MIN_OPTIONS = 2
_MAX_OPTIONS = 10
_MAX_QUESTION_LEN = 500
_MAX_OPTION_LEN = 256


def create_poll(
    *,
    message_id: UUID,
    conversation_id: UUID,
    organization_id: UUID,
    question: str,
    option_labels: list[str],
    created_by: UUID,
    message_created_seq: int,
    allows_multiple: bool = False,
) -> Poll:
    normalized_q = question.strip()
    if not normalized_q or len(normalized_q) > _MAX_QUESTION_LEN:
        raise PollInvalidError(f"Question must be 1..{_MAX_QUESTION_LEN} characters.")

    options: list[PollOption] = []
    seen: set[str] = set()
    for idx, raw in enumerate(option_labels):
        label = raw.strip()
        if not label or len(label) > _MAX_OPTION_LEN:
            raise PollInvalidError(f"Each option must be 1..{_MAX_OPTION_LEN} characters.")
        key = label.casefold()
        if key in seen:
            raise PollInvalidError("Duplicate poll options are not allowed.")
        seen.add(key)
        options.append(PollOption(id=uuid4(), poll_id=UUID(int=0), position=idx, label=label))

    if len(options) < _MIN_OPTIONS or len(options) > _MAX_OPTIONS:
        raise PollInvalidError(f"Poll must have {_MIN_OPTIONS}..{_MAX_OPTIONS} options.")

    poll = Poll(
        message_id=message_id,
        conversation_id=conversation_id,
        organization_id=organization_id,
        question=normalized_q,
        created_by=created_by,
        allows_multiple=allows_multiple,
        message_created_seq=message_created_seq,
        options=options,
    )
    for opt in poll.options:
        opt.poll_id = poll.id
    return poll
