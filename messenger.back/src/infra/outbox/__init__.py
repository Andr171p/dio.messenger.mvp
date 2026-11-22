# Канал PostgreSQL NOTIFY: API будит relay сразу после записи в outbox
OUTBOX_CHANNEL = "messenger_outbox"

__all__ = ["OUTBOX_CHANNEL"]

# ``python -m src.infra.outbox.relay`` — отдельный worker (см. relay.py).
