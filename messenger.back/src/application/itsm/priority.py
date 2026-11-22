def is_p1_priority(value: str | int | None) -> bool:
    """True for Desk-style P1 markers: p1, P1, 1."""
    if value is None:
        return False
    if isinstance(value, int):
        return value == 1
    normalized = str(value).strip().lower()
    return normalized in {"p1", "1"}