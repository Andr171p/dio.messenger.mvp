# Status: ITSM / DioDesk tickets integration

- **Дата:** 2026-11-22
- **Решение:** [DEC-0007](decisions/DEC-0007-itsm-tickets-integration.md)

## Сделано (срезы 1–4)

| API | Назначение |
|---|---|
| `GET /v1/resources/preview` | Safe preview заявки (Bearer → Desk; guest field filter) |
| `POST /v1/resources/actions` | `start_progress` / `assign` / `resolve` / `close` / `reopen` |
| `GET/PUT/DELETE …/context-link` | Primary ContextLink беседы |
| `POST …/conversations/{id}/tickets` | Create-from-chat + link + optional resource message |
| `POST /v1/service/context-conversations` | Идемпотентный provision чата под ресурс |

Также: content block `resource`, миграция `context_links`, adapter `DioDeskItsmAdapter`.

## Smoke

`messenger.back/scripts/e2e_smoke.py` — create-from-chat, context-link, preview, provision (+ idempotent).
