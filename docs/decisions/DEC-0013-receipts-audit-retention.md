# DEC-0013 — Delivery receipts, audit log, event retention

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §7.3 retention, §receipts; Session 5 implementation plan

## Решение

1. **Delivery cursor** — колонка `last_delivered_message_seq` на `conversation_members`; `PUT /v1/conversations/{id}/delivery-cursor` с монотонным upsert (как read-cursor, helper `monotonic_receipt_cursor`).
2. **WS fanout** — ephemeral Redis path, **без** durable `conversation_events`; тип `receipt.delivered_updated` (compact state, см. DEC-0005 typing/presence).
3. **Audit** — таблица `audit_events`; `log_audit(...)` из membership/policy/pin/forward/ITSM link мутаций; staff owner/admin: `GET /v1/audit?conversationId=`.
4. **Retention** — worker `python -m src.infra.retention.worker`: prune `conversation_events` старше `EVENT_RETENTION_DAYS` (default 90), не менее `MIN_RETAINED_EVENTS` (default 1000) на беседу; hard-delete tombstoned `messages` после `MESSAGE_TOMBSTONE_RETENTION_DAYS`.
5. **Sync gap** — существующий `SnapshotRequiredError` / `event_store.min_seq` при cursor до horizon (без изменений контракта).

## Последствия

- Клиент обновляет delivery cursor после локальной доставки; read и delivery — раздельные cursors в manifest/snapshot.
- Audit append-only в той же транзакции, что команда (best-effort консистентность с outbox-событиями).
- Retention worker — отдельный процесс (как media worker); после prune клиенты с устаревшим event cursor делают snapshot reset.