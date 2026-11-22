"""Monotonic receipt cursor helpers (read / delivery)."""


def monotonic_receipt_cursor(
    current: int,
    requested: int,
    *,
    upper_bound: int,
) -> tuple[int, bool]:
    """Вычисляет следующий cursor: max(current, requested), cap upper_bound.

    Returns (next_seq, changed).
    """

    next_seq = max(current, requested)
    next_seq = min(next_seq, upper_bound)
    changed = next_seq != current
    return next_seq, changed