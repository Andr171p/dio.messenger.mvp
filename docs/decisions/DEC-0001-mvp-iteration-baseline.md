# DEC-0001 — Baseline первой итерации backend MVP

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision (не ADR)
- **Контекст:** ответы на уточнения перед Этапом 1; [ARCHITECTURE.md](../ARCHITECTURE.md) §17

## Решение

### Scope итерации

1. Сразу **Этап 1** (domain + PostgreSQL + durable send). Docker и каркас FastAPI/health/auth — попутно, по стилю `dio.kb/kb.back`.
2. Фокус — **ядро** (conversation/membership/message/event/outbox/idempotency/seq/ACL). Остальные product-фичи (media processing/variants, FTS, ITSM, guests UI) — следующие итерации поверх ядра.
3. Python **3.14**; зависимости и стиль как в `kb.back` (DDF, Ruff, Alembic, `infra/`).

### Окружение

1. Docker Compose в корне репозитория через `include` отдельных файлов в `docker/`.
2. Отдельные host-порты, чтобы жить рядом с DioDesk (`diodesk_fork_prod_version`) и KB.
3. S3 — **RustFS** (`docker/rustfs.docker-compose.yml`) + `storage-init` (бакет media).
4. Auth для проверки backend: DioDesk на `http://localhost:8001`; `SRV_IAM_BASE_URL` по умолчанию туда же.

### Tenancy / auth

1. **Single-tenant** на период запуска у ДИО Консалт: stub `organization_id = 00000000-0000-0000-0000-000000000000`, клиенты (гости) подключаются в тот же tenant.
2. Cross-tenant и полноценный org claim из Legacy IAM — вне этой итерации; запрет произвольного `organization_id` из client body остаётся.
3. Auth adapter — Legacy DIO Desk (`SrvIamClient` → `/api/v1/auth/userinfo`), как в CODE_STANDARDS / KB.

### Продуктовые defaults (ядро)

| Вопрос | Решение сейчас | Отложено |
|---|---|---|
| History on join | Новый участник видит историю **с `history_from_seq` (= seq на момент join)** | Org-policy «полная история» |
| Direct uniqueness | **Один canonical DIRECT** на пару principals в организации | Несколько DM |
| Idempotency scope | `(conversation_id, sender_id, client_message_id)` | — |
| Delivery receipts | Только **read cursors**; `delivered` не обещаем | Delivery protocol |
| Delete | **Tombstone** + durable `message.deleted` event | Hard-delete / legal hold |
| Event retention | Горизонт **30 дней** delta; иначе `snapshot_required` | Тюнинг по нагрузке |
| Media / FTS / ITSM / WS fanout | Модуль media (DEC-0003); processing/variants позже | Полный lifecycle |

### Документация решений

- `docs/decisions/` — рабочие/локальные решения итераций.
- `docs/adr/` — архитектурно значимые, долгоживущие решения.

## Последствия

- Ядро можно тестировать на correctness (M-001…M-010) без гостевого multi-tenancy.
- При появлении org claim в IAM потребуется миграция данных с stub organization и отдельный DEC/ADR.
- Порты Docker зафиксированы в `.env.example`; смена — через env, не хардкод в коде приложения.
