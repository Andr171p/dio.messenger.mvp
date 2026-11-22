# DEC-0014 — P1 autoprovision и suggest create ticket

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** DEC-0007, DEC-0008; ARCHITECTURE §2 ITSM; Session 6 MVP Core

## Решение

### P1 incident room (service)

1. **`POST /v1/service/context-conversations`** — без изменения поведения; опциональное поле `priority` в DTO для caller metadata.
2. **`POST /v1/service/incidents/p1-provision`** — тот же идемпотентный `provision_context_conversation`; если `priority` передан, он **обязан** быть P1 (`p1` / `P1` / `1`, case-insensitive для строк).
3. Идемпотентность — как в DEC-0007: уникальность `(organization_id, provider, resource_type, resource_id)` в `context_links`; повторный вызов возвращает существующий `conversationId`, `created=false`.
4. Автосоздания заявок нет — только чат ↔ уже существующий ticket `resourceId`.

### Suggest create ticket (user API)

1. **`GET …/messages/{messageId}/ticket-suggestion`** — staff (не guest): `title` = первая непустая строка plaintext сообщения (≤255), `description` = весь searchable text (≤10 000), `suggested=true` только если есть текст **и** у беседы ещё нет primary context link.
2. **`POST …/ticket-suggestion/confirm`** — явное подтверждение; body с опциональными override полей → тот же путь, что `POST …/tickets` (`create_ticket_from_chat`). Без silent auto-create.
3. Guest на suggestion/confirm — `403` (как create-from-chat).

## Последствия

- Text extraction переиспользует `extract_searchable_text` (text blocks).
- Desk/daemon для P1 может звать `p1-provision` или generic provision с `priority: P1` (документированный контракт).