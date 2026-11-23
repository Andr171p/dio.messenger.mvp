# DIO Messenger — Implementation Plan (MVP)

> **Статус:** проектный план. Не содержит календарных обещаний.  
> **Основная спецификация:** [ARCHITECTURE.md](../architecture/ARCHITECTURE.md)

## Принцип работы

Сначала фиксируем корректность durable send + sync. Затем строим offline-first UI и продуктовые функции. Реализация AI и звонков не должна задерживать полноценный MVP.

## Этап 0. Contracts & invariants

**Задачи**

- Утвердить ID model: organization/principal/conversation/message/event/client_message.
- Согласовать `DIRECT`/`GROUP`, membership lifecycle, visibility истории нового участника, delete/retention.
- Спроектировать HTTP request/response и WebSocket payload schemas, error taxonomy, idempotency scope.
- Зафиксировать гарантии: ACK=DB commit, per-conversation seq, event delivery at-least-once, client reconciliation.
- Проверить уже существующие DDF `OutboxProcessor`, `SqlAlchemyOutboxStore`, realtime publisher и WS subscriptions; выделить adapter boundaries.

**Done when:** тестируемые API contracts и миграции согласованы; критические открытые вопросы отмечены владельцами решений.

## Этап 1. Domain + PostgreSQL

**Задачи**

- Conversation, Membership, Message, ConversationEvent, constraints, indices, migration.
- Transactional send use case + idempotency + per-conversation seq.
- Read history keyset pagination, edit/delete/reactions/pins/mentions.
- IAM authorization и tenant isolation через интерфейс.
- Attachments metadata model и policy interfaces.

**Done when:** unit/integration tests покрывают concurrency, rollback, duplication, ACL и deterministic pagination.

## Этап 2. Outbox, Event Relay, WebSocket и Sync

**Задачи**

- Использовать DDF Transactional Outbox в транзакции создания/изменения сообщения.
- Добавить opt-in PostgreSQL NOTIFY/listener, periodic polling fallback; RabbitMQ publisher confirms и idempotent consumers.
- Realtime delivery через Redis Pub/Sub + DDF WS Manager; авторизуемые user/conversation rooms.
- Durable sync events, manifest endpoint, delta API, snapshot reset protocol, explicit access revocation.
- Presence/typing TTL и throttling.

**Done when:** delivery survives pod death, lost NOTIFY, broker retry и Redis outage; два инстанса работают согласованно; event gap восстанавливается.

## Этап 3. Web frontend foundation

**Задачи**

- React/Vite app и встраиваемый UI-модуль.
- Dexie schema, migrations, local Outbox, optimistic messages, send retries.
- WS client, Sync Engine, startup manifest/resync, offline/online state.
- Multiple tabs coordination, virtualized message list with scroll anchoring.
- Composer, drafts, reply/edit/delete, reactions, mentions, basic navigation.

**Done when:** offline send и reopen корректно работают, нет дублей после ACK timeout, рендер большой истории стабилен.

## Этап 4. Enterprise/ITSM + product MVP surface

**Задачи**

- Explicit guests, roles, conversation policy, visual boundary warnings (staff vs customer из DioDesk IAM).
- Safe attachments lifecycle: upload, validation, scanning, access control; avatars + thumbnail/preview variants.
- PostgreSQL FTS + ACL filters.
- ResourceReference, secure preview/actions, context link (уже в ядре); **P1 → идемпотентный incident room**; **suggest create ticket** из сообщения (confirm UX).
- Topics/threads, polls, scheduled messages.
- Mentions, pins, forward с ACL (если не закрыты ранее).
- Audit, retention behavior, customer admin controls for MVP.

**Done when:** внешние пользователи не видят внутренние сведения; запрещённые операции блокируются backend; ITSM action/preview с проверенными правами; P1-provision и ticket-suggest работают; threads/polls/scheduled доступны в API.

## Этап 5. Hardening и пилот

**Задачи**

- Instrument metrics/traces: send ACK, outbox lag, recipient delivery, sync gaps, WS fanout.
- Security tests и пилотные role/tenant scenarios.
- Load tests: 1:1, busy group, search, multi-instance, reconnect storm.
- Fault injection: process crashes, DB/broker/Redis degradation, slow consumers.
- Backups, restore drill, deployment rollbacks, logging/audit policy.
- Проверить p95 относительно заданных SLO и документировать фактические результаты.

**Done when:** критические failure paths воспроизводимо проходят, recovery работает, observability настроена, известны capacity и риски.

## Следующие решения

1. Detailed domain dataclasses и migration schema.
2. HTTP DTO и WS event envelopes; versioning.
3. Sync cursor + initial snapshot contract.
4. DDF Outbox wakeup API с fallback polling.
5. Frontend Dexie schema и state machine.

## Что сознательно не делаем в первом MVP

- Не создаём набор отдельных микросервисов `message`, `reaction`, `presence`.
- Не мигрируем в Cassandra без нагрузочных метрик.
- Не строим broker-first ради ускорения `200 OK`.
- Не делаем собственное шифрование поверх TLS и не обещаем невозможный запрет скриншотов в браузере.
- Не объединяем AI и звонки с критическим send path.
