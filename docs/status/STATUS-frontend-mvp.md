# Status: Frontend Messenger Core (production)

- **Дата:** 2026-11-23
- **Код:** `messenger.web/`
- **Макеты:** `docs/design/screenshots/` + Penpot
- **Итерации:** [FRONTEND_PRODUCTION_ITERATIONS.md](../development/FRONTEND_PRODUCTION_ITERATIONS.md)
- **Ревью:** [frontend-review.md](../reviews/frontend-review.md)

## Scope закрыт (I0–I7)

| Область | Результат |
|---|---|
| Assets | Лого, обои light/dark, send icon; скрины в `docs/design/screenshots/` |
| Sync security | `access.revoked` → wipe; manifest vs local wipe; compact WS → HTTP delta; snapshot pagination; auth session unify |
| Drafts | Черновик/reply/edit привязаны к conversationId |
| Layout | `100dvh`, mobile list→chat→context, virtualizer `measureElement` |
| Read cursor | Только видимые сообщения + `visibilityState` |
| API contracts | reply=`serverId`; reactions POST/DELETE; delete ACL+rollback; `dio-desk` preview; media blocks |
| Design | Rail logo, wallpapers, red send, bubbles/list/context |
| Chat features | Pins, forward, mentions/`#` pickers, quotes/reply preview, context menu |
| Presence/typing/receipts | WS ephemeral; typing indicator; ✓/✓✓ |
| ITSM | Smart card + context panel + «Открыть в DIO Desk» |

## Как поднять

```bash
# DioDesk
cd C:\Users\andre\diodesk_fork_prod_version
docker compose up -d

# Messenger infra + API
cd C:\Users\andre\MyProjects\dio.messenger
docker compose up -d
cd messenger.back
uv run uvicorn src.main:app --reload --host 127.0.0.1 --port 8002
uv run python -m src.infra.outbox.relay

# Frontend
cd ..\messenger.web
pnpm install
pnpm --filter @dio/messenger exec vite --host 127.0.0.1 --port 5173
```

Smoke login: `admin@admin.com` / `admin`.

### Demo users / chats

```bash
cd messenger.back
uv run python scripts/seed_demo.py --reset-passwords
```

| Логин | Пароль | Роль в демо |
|---|---|---|
| `admin@admin.com` | `admin` | Админ, создаёт чаты |
| `anna.smirnova@test.com` | `demo123` | Дежурная / direct |
| `ivan.petrov@test.com` | `demo123` | Дежурная / Внедрение |
| `maria.volkova@test.com` | `demo123` | Дежурная / Внедрение |

Сиды: группы **«Дежурная смена»**, **«Внедрение»**, direct с Анной; сообщения, reply, reaction, pin.

## Проверки

- `pnpm --filter @dio/messenger-core test`
- `pnpm --filter @dio/messenger typecheck` / `build`
- Login → список → send / reply / reaction / pin / forward
- Theme toggle + wallpaper; `#` / `@` pickers; ticket context panel
- Kick user → local wipe of conversation projection

## Backlog (I8–I14)

Media lifecycle UX, members/audit overlay, threads, polls, scheduled, in-chat search polish, multi-tab hardening — см. iterations doc.

## Связанные docs

- [FRONTEND_ARCHITECTURE](../architecture/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_CODE_STANDARDS](../development/FRONTEND_CODE_STANDARDS.md)
- [UI_UX_DESIGN](../design/UI_UX_DESIGN.md)
