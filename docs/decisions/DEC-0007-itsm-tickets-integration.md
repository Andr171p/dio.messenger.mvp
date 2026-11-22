# DEC-0007 — ITSM / DioDesk tickets integration (MVP)

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §12; CODE_STANDARDS «Обмен с ITSM»; план ITSM tickets integration

## Решение

1. **Источник истины по заявке** — DioDesk. Messenger хранит только `ResourceReference` и `ContextLink`, не Ticket aggregate.
2. **`resourceType`:** `ticket` (задачи Desk — тот же модуль tickets с полем `type`).
3. **`provider`:** `dio-desk`.
4. **Context link cardinality:** ровно один primary link на conversation; уникальность `(organization_id, provider, resource_type, resource_id)` — один чат на заявку.
5. **Content block:** `{"type":"resource","provider":"dio-desk","resourceType":"ticket","resourceId":"<uuid>","number":"<optional snapshot>"}`.
6. **Preview field matrix:**
   - employee/member+: `number`, `title`, `status`, `priority`, `ticketType`, `assigneeDisplayName?`
   - guest: `number`, `title`, `status`, `priority` (без assignee и внутренних полей)
7. **AuthZ на заявку:** вызовы Desk с Bearer пользователя; кнопки UI не дают прав.
8. **Порядок срезов:** Link+Preview → Actions → Create-from-chat → Provision-from-ticket.
9. **Send path** не зависит от доступности Desk: resource-block коммитится как ref; preview отдельно.

## Последствия

- Нужен DioDesk tickets HTTP adapter + `BearerToken` dependency.
- Service provision API — под `CurrentClient` / legacy admin; `organizationId` только для доверенного caller.
