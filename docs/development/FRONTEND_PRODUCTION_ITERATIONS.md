# Frontend production iterations

- **Дата:** 2026-11-23
- **Scope сейчас:** Messenger Core (I0–I7)
- **Access revoke:** wipe локальной проекции беседы (history, drafts, outbox, cursor)
- **Связано:** [STATUS-frontend-mvp.md](../status/STATUS-frontend-mvp.md), [FRONTEND_ARCHITECTURE.md](../architecture/FRONTEND_ARCHITECTURE.md), [frontend-review.md](../reviews/frontend-review.md)

## Цель

Довести `messenger.web` до production-ready Messenger Core: надёжный sync/offline, UI под DIOS/Telegram-паттерны, все core-фичи с уже готовым backend. Threads / polls / scheduled и расширенный enterprise UX — в backlog-итерациях.

## Итерации

| Итерация | Содержание | Критерий done | Статус |
|---|---|---|---|
| **I0** | Assets, screenshots, этот план | Скрины в `docs/design/screenshots/`, лого/обои/send в `public/`, документ в индексе | Done |
| **I1** | P1 sync/security/auth/drafts | `access.revoked` wipe; WS envelope type + delta before cursor; draft isolation; snapshot pagination; auth logout sync; unit tests | Done |
| **I2** | Layout, virtualizer, read cursor, a11y P2 | 100dvh shell; mobile list→chat→context; measured virtualizer; visible-only read; focus-within / IME / modal focus | Done |
| **I3** | API contracts | reply=`serverId`; reaction POST/DELETE paths; delete ACL + rollback; `dio-desk` preview + conversationId; media blocks | Done |
| **I4** | Design parity | Rail logo, wallpapers light/dark, red send icon, bubbles/list/context как на скринах | Done |
| **I5** | Pins, forward, mentions, quotes, ticket picker | Context menu + pin bar; forward modal; `@`/`#` pickers; reply quote preview | Done |
| **I6** | Presence, typing, receipts | Online/last-seen; typing indicator; ✓/✓✓ по delivery/read | Done |
| **I7** | ITSM polish + verify | Smart card + actions; STATUS update; typecheck/test/build | Done |
| **I8** | Media lifecycle UX | Scan states, previews, download ACL | Backlog |
| **I9** | Members, policy/guest UX, audit (staff) | Overlay участников, guest banners, audit panel | Backlog |
| **I10** | Threads UI | Create/list/reply in thread (API ready) | Backlog |
| **I11** | Polls UI | Create/vote/close | Backlog |
| **I12** | Scheduled messages UI | Schedule/cancel own | Backlog |
| **I13** | In-chat search, mute/pin list polish | Scoped search; conversation pin/mute UI | Backlog |
| **I14** | Hardening | Multi-tab, IDB paging perf, e2e suite | Continuous |

## Манифест ассетов

| Файл | Назначение |
|---|---|
| [`docs/design/screenshots/01-light-shell.png`](../design/screenshots/01-light-shell.png) | Light desktop shell |
| [`docs/design/screenshots/02-light-context-panel.png`](../design/screenshots/02-light-context-panel.png) | Light + заявка context |
| [`docs/design/screenshots/03-light-ticket-picker.png`](../design/screenshots/03-light-ticket-picker.png) | `#` ticket picker |
| [`docs/design/screenshots/04-dark-shell.png`](../design/screenshots/04-dark-shell.png) | Dark desktop shell |
| [`docs/design/screenshots/05-dark-context-panel.png`](../design/screenshots/05-dark-context-panel.png) | Dark + заявка context |
| `apps/messenger/public/brand/dios-mark.png` | Лого DIOS |
| `apps/messenger/public/wallpapers/chat-dark.jpg` | Обои тёмной темы |
| `apps/messenger/public/wallpapers/chat-pattern-source.jpg` | Источник паттерна (light/dark composite) |

## Правила выполнения

1. Сначала I1 (целостность/конфиденциальность), затем layout, contracts, design, features.
2. Клиент подстраивается под фактические backend routers; не менять API без необходимости.
3. Optimistic UI с откатом; права не выводить только из скрытых кнопок.
4. Следовать [FRONTEND_CODE_STANDARDS.md](FRONTEND_CODE_STANDARDS.md).
