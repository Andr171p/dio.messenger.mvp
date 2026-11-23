# Status: Receipts, audit, retention (Session 5)

- **Дата:** 2026-11-22
- **Решение:** [DEC-0013](../decisions/DEC-0013-receipts-audit-retention.md)

## Сделано

| Компонент | Назначение |
|---|---|
| Migration `h8b9c0d1e2f3` | `last_delivered_message_seq`, таблица `audit_events` |
| `PUT …/delivery-cursor` | Монотонный delivery cursor + `receipt.delivered_updated` WS |
| `GET /v1/audit?conversationId=` | Audit для staff owner/admin |
| `log_audit` | member add/remove, policy, pin/unpin, forward, ITSM links |
| `python -m src.infra.retention.worker` | Prune events + purge старых tombstones |

## Конфигурация

- `EVENT_RETENTION_DAYS` (default 90)
- `MIN_RETAINED_EVENTS` (default 1000)
- `MESSAGE_TOMBSTONE_RETENTION_DAYS` (default 90)
- `RETENTION_WORKER_POLL_INTERVAL` (default 3600)

## Retention и sync

После prune минимальный seq в `conversation_events` растёт. `GET …/events?afterSeq=` при `afterSeq + 1 < min_seq` возвращает **`snapshot_required`** (`SnapshotRequiredError`).

## DTO / sync

- `ConversationMemberDTO`, manifest и snapshot membership включают `lastDeliveredMessageSeq`.

## Тесты

`messenger.back/tests/unit/test_receipts_audit_retention.py` — `monotonic_receipt_cursor`, `AuditEventDTO`.