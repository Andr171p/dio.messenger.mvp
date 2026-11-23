# Status: Guests / ConversationPolicy / IAM adapter

- **Дата:** 2026-11-22
- **Решение:** [DEC-0009](decisions/DEC-0009-guests-and-conversation-policy.md)

## API

| Endpoint | Notes |
|---|---|
| `POST /v1/conversations/{id}/members` | `role`: `member` \| `admin` \| `guest` |
| `GET/PATCH /v1/conversations/{id}/policy` | ConversationPolicy overrides |
| `GET /v1/directory/users?q=` | Invite catalog (Desk users proxy) |
| Conversation / snapshot DTO | `hasExternalMembers` |

## IAM

- `userinfo` → `counterpartyId`, `principalKind` (`staff`/`customer`) из roles.
- Staff invite guest; customer не создаёт groups / не ищет catalog.

## Enforcement

- Guest: ITSM actions/create ticket/context-link (ранее) + media pre-`history_from_seq` deny.
- `history_from_seq` на join guest как у любого нового member.

## Tests

- `tests/unit/test_guests_and_iam.py`
