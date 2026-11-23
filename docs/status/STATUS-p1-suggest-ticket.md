# Status: P1 autoprovision + ticket suggestion

- **Дата:** 2026-11-22
- **Решение:** [DEC-0014](decisions/DEC-0014-p1-provision-ticket-suggest.md)

## Service (P1 incident room)

| HTTP | Назначение |
|---|---|
| `POST /v1/service/context-conversations` | + optional `priority` (metadata) |
| `POST /v1/service/incidents/p1-provision` | Идемпотентный provision; `priority` если задан — только P1 |

## User (suggest → confirm)

| HTTP | Назначение |
|---|---|
| `GET /v1/conversations/{id}/messages/{messageId}/ticket-suggestion` | Рекомендация title/description из текста |
| `POST …/ticket-suggestion/confirm` | Overrides → create-from-chat |
| `POST …/tickets` | По-прежнему прямое создание (staff) |

Guests: suggestion + confirm + create ticket — `403`.

## Проверено

`pytest tests/unit/test_itsm_ticket_suggestion.py` — P1 priority parsing, title/description extraction.