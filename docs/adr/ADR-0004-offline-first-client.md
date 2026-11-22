# ADR-0004 — Offline-first клиент и persistent local Outbox

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Контекст:** [ARCHITECTURE.md](../ARCHITECTURE.md), раздел 11

## Контекст

Качество мессенджера зависит от мгновенного local UI, сохранности черновиков и возможности переживать разрывы сети. Online HTTP/WS API не должен быть обязательным условием для чтения уже загруженной истории.

## Решение

- React + TypeScript + Vite, TanStack Query, Zustand, TanStack Virtual.
- IndexedDB + Dexie содержит сообщения, историю событий/текущее состояние, черновики, sync cursors и persistent local Outbox.
- Render из local database; HTTP/WS обновляют её через один Sync Engine.
- При Send атомарно создать локальное сообщение и outbox command с `client_message_id`, показать `queued`; повторять ту же команду до server ACK или постоянной ошибки.
- Обработать out-of-order события, duplicate events, gaps, snapshot reset; multi-tab leader/lease и BroadcastChannel для координации.
- Сервер остаётся authoritative: несогласованный optimistic state подлежит reconciliaton.

## Trade-offs

- Более сложная клиентская логика и IndexedDB schema migrations.
- Невозможно гарантировать отправку при закрытом браузере или мгновенную очистку данных на offline устройстве.
- Background Sync/Service Worker — улучшение, а не основа гарантий.
- Для будущего React Native заменить IndexedDB на SQLite через storage adapter, сохранить protocol.
