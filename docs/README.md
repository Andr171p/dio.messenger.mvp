# DIO Messenger — documentation

**Версия документации:** MVP baseline, 2026-11-22  
**Статус:** согласованные архитектурные решения; детали реализации и некоторые продуктовые инварианты открыты.

## С чего начать

1. [**architecture/ARCHITECTURE.md**](architecture/ARCHITECTURE.md) — единый полный документ: идея продукта, scope, стек, схема данных, DDD, realtime, sync, offline-first, outbox, безопасность, ITSM, масштабирование и открытые вопросы.
2. [**development/IMPLEMENTATION_PLAN.md**](development/IMPLEMENTATION_PLAN.md) — порядок работ, контрактные вехи и критерии готовности.
3. [**development/TEST_PLAN.md**](development/TEST_PLAN.md) — integration/e2e/load/security и показатели SLO.
4. [**development/CODE_STANDARDS.md**](development/CODE_STANDARDS.md) — как писать код и контракты MVP.
5. [**design/UI_UX_DESIGN.md**](design/UI_UX_DESIGN.md) · [**design/ICONOGRAPHY.md**](design/ICONOGRAPHY.md) — UI/UX и система иконок.
5a. [**architecture/FRONTEND_ARCHITECTURE.md**](architecture/FRONTEND_ARCHITECTURE.md) · [**development/FRONTEND_CODE_STANDARDS.md**](development/FRONTEND_CODE_STANDARDS.md) — frontend.
5b. [**status/STATUS-frontend-mvp.md**](status/STATUS-frontend-mvp.md) — статус frontend MVP.
5c. [**development/FRONTEND_PRODUCTION_ITERATIONS.md**](development/FRONTEND_PRODUCTION_ITERATIONS.md) — итерации production frontend (I0–I14).
5d. [**development/FRONTEND_DESIGN_REVIEW_PLAN.md**](development/FRONTEND_DESIGN_REVIEW_PLAN.md) — сверка с Penpot, воспроизведённые дефекты и порядок исправлений на фронте и API.
5e. [**development/CHAT_MANAGEMENT_PLAN.md**](development/CHAT_MANAGEMENT_PLAN.md) — проектирование чатов, профилей и тем, интеграция с IAM и критерии приёмки ветки.
6. [**adr/**](adr/) — Architecture Decision Records (устойчивые решения с trade-offs).
7. [**decisions/**](decisions/) — рабочие решения итераций (не ADR).
8. [**status/**](status/) — отчёты о реализации и проверках по итерациям.

## Структура docs/

```text
docs/
├── README.md                 # этот навигатор + правила ведения
├── architecture/             # системный дизайн (SSOT)
│   └── ARCHITECTURE.md
├── design/                   # продуктовый / UI UX дизайн
│   ├── UI_UX_DESIGN.md
│   └── ICONOGRAPHY.md
├── development/              # план, стандарты, тестирование
│   ├── CODE_STANDARDS.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── TEST_PLAN.md
├── status/                   # статус реализации по итерациям
│   ├── README.md
│   └── STATUS-*.md
├── adr/                      # Architecture Decision Records
│   └── ADR-NNNN-*.md
└── decisions/                # рабочие решения итераций
    ├── README.md
    └── DEC-NNNN-*.md
```

Планируемые каталоги (заводить только при появлении содержимого):

```text
docs/
  contracts/      # OpenAPI, WS/event schemas
  backend/        # data-model, deployment specifics
  frontend/       # IndexedDB, sync-engine
  operations/     # runbooks, dashboards
```

## Архитектурные решения

| ADR | Решение | Статус |
|---|---|---|
| [0001](adr/ADR-0001-service-boundary-and-storage.md) | Independent Service + PostgreSQL | Accepted |
| [0002](adr/ADR-0002-http-websocket-and-sync.md) | HTTP + WS + durable Sync | Accepted |
| [0003](adr/ADR-0003-transactional-outbox-and-realtime.md) | Transactional Outbox + LISTEN/NOTIFY + fallback polling | Accepted |
| [0004](adr/ADR-0004-offline-first-client.md) | Dexie/IndexedDB + local Outbox | Accepted |
| [0005](adr/ADR-0005-tenancy-and-security.md) | Organization ownership, guests, no E2EE | Accepted |

## Правила ведения документации

### Куда класть новый документ

| Тип | Папка | Именование |
|---|---|---|
| Системный дизайн / инварианты продукта | `architecture/` | `ARCHITECTURE.md` — единый SSOT; отдельные файлы только при явном дроблении |
| UI/UX, продуктовый визуал | `design/` | `UI_UX_*.md` или тематические файлы |
| План работ, стандарты кода, тест-план | `development/` | говорящие `UPPER_SNAKE.md` |
| Долгоживущее архитектурное решение | `adr/` | `ADR-NNNN-short-slug.md` (следующий свободный номер) |
| Локальное / итерационное решение | `decisions/` | `DEC-NNNN-short-slug.md` |
| Что сделано / как проверить | `status/` | `STATUS-<topic>.md` |
| Контракты API/событий | `contracts/` | только когда payloads стабилизированы |
| Runbooks / ops | `operations/` | только при реальных операционных процедурах |

### ADR vs DEC

- **ADR** — устойчивый выбор с контекстом, альтернативами и последствиями. Не переписывать задним числом: supersede новой записью.
- **DEC** — pragmatic/local/iteration choices (scope, порты, fallback, порядок внедрения). Не дублировать ADR.

### Сопровождение

1. `architecture/ARCHITECTURE.md` — single source of truth по системному дизайну.
2. Изменение архитектуры → обновить ARCHITECTURE и связанные ADR / `TEST_PLAN` / `CODE_STANDARDS`.
3. Новая итерация реализации → DEC (если нужно) + `STATUS-*.md` с критериями проверки; индекс в `status/README.md` и `decisions/README.md`.
4. Относительные ссылки между документами — только внутри `docs/` (или в код/скрипты репозитория); не ссылаться на локальные `Downloads/` и внешние копии.
5. Не создавать пустые каталоги «на будущее»; заводить папку вместе с первым файлом.
6. Открытые вопросы живут в `ARCHITECTURE.md` (§17) и не считаются утверждёнными решениями.
7. Корневой `docs/README.md` — единственный навигатор верхнего уровня; при переносе файлов обновлять его и индексы подпапок.
