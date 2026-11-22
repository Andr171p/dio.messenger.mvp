# DIO Messenger — documentation

**Версия документации:** MVP baseline, 2026-11-22  
**Статус:** согласованные архитектурные решения; детали реализации и некоторые продуктовые инварианты открыты.

## С чего начать

1. [**ARCHITECTURE.md**](ARCHITECTURE.md) — **единый полный документ**: идея продукта, scope, стек, схема данных, DDD, realtime, sync, offline-first, outbox, безопасность, ITSM, масштабирование и открытые вопросы.
2. [**IMPLEMENTATION_PLAN.md**](../../../../Downloads/DIO_Messenger_docs/docs/IMPLEMENTATION_PLAN.md) — порядок работ, контрактные вехи и критерии готовности.
3. [**TEST_PLAN.md**](../../../../Downloads/DIO_Messenger_docs/docs/TEST_PLAN.md) — integration/e2e/load/security и показатели SLO.
4. [**ADR/**](adr/) — короткие записи принятых архитектурных решений с причиной и trade-offs.
5. [**decisions/**](decisions/) — рабочие решения итераций (не ADR).
6. [**STATUS-media-mvp.md**](STATUS-media-mvp.md) — что реализовано в media MVP и как руками проверить.
7. [**STATUS-stage2.md**](STATUS-stage2.md) — Outbox relay + WebSocket + Sync (Этап 2).
8. [**STATUS-backend-pre-frontend.md**](STATUS-backend-pre-frontend.md) — smoke перед фронтом (IAM + API + WS + media).
9. [**STATUS-presence-typing-reactions.md**](STATUS-presence-typing-reactions.md) — presence/typing + reactions.
10. [**STATUS-mentions-pins-forward.md**](STATUS-mentions-pins-forward.md) — mentions, pins, forward ACL.
11. [**STATUS-guests-policy.md**](STATUS-guests-policy.md) — guests, ConversationPolicy, IAM principal kind.
12. [**STATUS-search-fts.md**](STATUS-search-fts.md) — message search FTS.
13. [**STATUS-media-lifecycle.md**](STATUS-media-lifecycle.md) — media worker scan/validate.
14. [**STATUS-receipts-audit-retention.md**](STATUS-receipts-audit-retention.md) — receipts, audit, retention worker.
15. [**STATUS-p1-suggest-ticket.md**](STATUS-p1-suggest-ticket.md) — P1 provision + ticket suggestion.
16. [**STATUS-threads-polls-scheduled.md**](STATUS-threads-polls-scheduled.md) — threads, polls, scheduled.
17. [**STATUS-hardening.md**](STATUS-hardening.md) — observability, load/fault checklist (Session 8).
18. [**STATUS-verification.md**](STATUS-verification.md) — P0–P8 verification report (smoke, ACL, CI, load/fault runbooks).

## Структура docs/

```text
docs/
├── README.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
├── TEST_PLAN.md
├── CODE_STANDARDS.md
├── decisions/
│   ├── DEC-0001-mvp-iteration-baseline.md
│   ├── DEC-0002-message-content-and-attachments.md
│   ├── DEC-0003-media-module.md
│   └── DEC-0004-stage2-outbox-ws-sync.md
└── adr/
    ├── ADR-0001-service-boundary-and-storage.md
    ├── ADR-0002-http-websocket-and-sync.md
    ├── ADR-0003-transactional-outbox-and-realtime.md
    ├── ADR-0004-offline-first-client.md
    └── ADR-0005-tenancy-and-security.md
```

## Архитектурные решения

| ADR | Решение | Статус |
|---|---|---|
| [0001](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0001-service-boundary-and-storage.md) | Independent Service + PostgreSQL | Accepted |
| [0002](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0002-http-websocket-and-sync.md) | HTTP + WS + durable Sync | Accepted |
| [0003](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0003-transactional-outbox-and-realtime.md) | Transactional Outbox + LISTEN/NOTIFY + fallback polling | Accepted |
| [0004](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0004-offline-first-client.md) | Dexie/IndexedDB + local Outbox | Accepted |
| [0005](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0005-tenancy-and-security.md) | Organization ownership, guests, no E2EE | Accepted |

## Правила сопровождения документации

- `ARCHITECTURE.md` — актуальное целостное представление MVP (single source of truth по системному дизайну).
- Значимые решения оформлять ADR: *контекст → решение → альтернативы → последствия*; существующие ADR не переписывать задним числом без фиксации новой записи superseding decision.
- Если архитектура меняется — обновлять и ARCHITECTURE, и связанные ADR/TEST_PLAN.
- Форматы публичных HTTP/WS contracts при стабилизации можно выделить в `contracts/` (OpenAPI, JSON Schema, event schemas).
- Детальные планы backend/frontend можно позже выделить в `backend/` и `frontend/`; не заводить множество пустых файлов заранее.
- Нефиксированные вопросы перечислены в `ARCHITECTURE.md`, раздел 17. Они не считаются утверждёнными решениями.
- Рабочие решения итераций (scope, порты, tenancy fallback и т.п.) — в `decisions/`, не в ADR.

## Рекомендуемое развитие дерева

Когда появится рабочий API и первые реальные payloads, можно расширить структуру, **не меняя текущий навигатор**:

```text
docs/
  contracts/
    http-api.yaml
    websocket-events.md
    synchronization.md
  backend/
    data-model.md
    deployment.md
  frontend/
    indexeddb-schema.md
    sync-engine.md
  operations/
    runbooks.md
    dashboards.md
```

Это **планируемые**, а не уже реализованные директории.
