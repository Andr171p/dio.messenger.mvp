# DEC-0009 — Guests, IAM adapter fields, ConversationPolicy

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §12–13; ADR-0005; план Session 1

## Решение

1. **Guest** — DioDesk customer (`customer` / `customer_admin` + `counterparty_id`), явно приглашённый с `MemberRole.GUEST`. Без guest-token.
2. **IAM adapter** парсит `counterparty_id` и выводит `principal_kind` (`staff` | `customer`). `organization_id` остаётся stub single-tenant.
3. **Invite:** staff/owner/admin; `AddMemberDTO.role=guest`; policy `allow_external_members` (auto-enable при первом guest invite).
4. **ConversationPolicy** — per-conversation overrides; guest не обновляет policy / не управляет members / ITSM actions (уже).
5. **Visibility:** `history_from_seq` + guest media access только для сообщений в окне истории.
6. **Banner:** `hasExternalMembers` в conversation/snapshot DTO.
7. **Catalog:** `GET /v1/directory/users` — proxy к Desk `/api/v1/users`.

## Последствия

- Миграция `conversation_policies`.
- Guest enforcement на messaging/media/search/forward опирается на membership role + policy.
