# Status: Frontend MVP foundation

- **Дата:** 2026-11-23 (обновлено: Penpot UI + CORS)
- **Код:** `messenger.web/`
- **Макеты:** Penpot «DIO Chat · Макеты MVP» (MCP `user-penpot`)
- **IAM:** DioDesk `http://localhost:8001`
- **Messenger API:** `http://127.0.0.1:8002`
- **Frontend:** `http://127.0.0.1:5173`

## Что сделано

| Этап | Результат |
|---|---|
| Penpot tokens | Exact light/dark hex из sets `DIO Chat/*`; Inter 15/22; default **light** |
| Shell UI | Rail 56 + list 320 + chat + context 352; chips Все/Личные/Группы; red send; patterned canvas; ticket cards |
| Auth + HTTP | DioDesk form login + userinfo; memory tokens; Bearer + correlationId |
| Offline core | Dexie + atomic outbox; edit/delete/reaction commands; read-cursor |
| Sync + WS | Manifest + events; WS ticket; `subscription.subscribe` per conversation; typing |
| Product UX | Ctrl+K search; new chat modal (directory + direct/group); guest banner; theme toggle |
| Media + ITSM | Upload session/complete; resource preview panel |
| Backend CORS | `CORSMiddleware` в `messenger.back/src/main.py` (`MESSENGER_CORS_ORIGINS`) |
| Hardening | PWA; Vitest; Playwright smoke |

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

## Проверки

- `pnpm typecheck` / `pnpm build` / `pnpm test`
- Login → список бесед (live) + статус «На связи · local-first»
- Send / reply / reactions / delete через outbox
- Ctrl+K search; ticket `#INC-…` → context panel

## Остаток относительно полного Penpot / API

- Контекстное меню 1:1 (цитата фрагмента, forward, pin) — частично (reply/edit/delete/reactions)
- Mentions autocomplete `@` / `#` ticket picker — UI-иконки есть, полный picker ещё нет
- Threads / polls / scheduled / members overlay — API есть, UI не закрыт
- Mobile boards из Penpot — desktop-first
- Media как typed `blocks: [{type:media}]` — upload есть, отправка блока упрощена

## Связанные docs

- [FRONTEND_ARCHITECTURE](../architecture/FRONTEND_ARCHITECTURE.md)
- [FRONTEND_CODE_STANDARDS](../development/FRONTEND_CODE_STANDARDS.md)
- [STATUS-backend-pre-frontend](STATUS-backend-pre-frontend.md)
