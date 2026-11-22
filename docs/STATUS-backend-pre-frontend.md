# Status: Backend ready for frontend

- **Дата:** 2026-11-22 (обновлено Session 8)
- **IAM:** DioDesk `diodesk_fork_prod_version` на `http://localhost:8001`
- **Messenger API:** `http://127.0.0.1:8000`
- **Workers:** `python -m src.infra.outbox.relay`, `python -m src.infra.media.worker`, `python -m src.infra.scheduled.worker`, `python -m src.infra.retention.worker`

## Smoke

Скрипт `messenger.back/scripts/e2e_smoke.py` — IAM login, sync, send, WS, media (см. исторические записи в git).

## API surface (Sessions 1–8)

### Health & system

| Method | Path | Notes |
|---|---|---|
| GET | `/health/live` | Liveness |
| GET | `/health/ready` | Readiness (MVP stub) |
| GET | `/v1/system/metrics` | Prometheus text (per instance) |

### Conversations & directory

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/conversations` | Create GROUP |
| POST | `/v1/conversations/direct` | Get or create DIRECT |
| GET | `/v1/conversations` | List for principal |
| GET | `/v1/conversations/{id}` | Conversation metadata |
| GET | `/v1/conversations/{id}/snapshot` | Resync body + messages window |
| GET | `/v1/conversations/{id}/members` | Members list |
| POST | `/v1/conversations/{id}/members` | Add member (`role`: member/admin/guest) |
| DELETE | `/v1/conversations/{id}/members/{principalId}` | Remove / kick |
| GET | `/v1/conversations/{id}/policy` | ConversationPolicy |
| PATCH | `/v1/conversations/{id}/policy` | Update policy overrides |
| GET | `/v1/directory/users` | IAM invite catalog (staff) |

### Messages, sync, cursors

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/conversations/{id}/messages` | Send (idempotent `clientMessageId`) |
| PATCH | `/v1/conversations/{id}/messages/{messageId}` | Edit own message |
| DELETE | `/v1/conversations/{id}/messages/{messageId}` | Tombstone delete |
| GET | `/v1/conversations/{id}/messages` | History (`beforeSeq`) |
| GET | `/v1/conversations/{id}/events` | Durable delta (`afterSeq`; may `snapshot_required`) |
| PUT | `/v1/conversations/{id}/read-cursor` | Read receipt cursor |
| PUT | `/v1/conversations/{id}/delivery-cursor` | Delivery cursor |
| GET | `/v1/sync/manifest` | Per-conversation high-water marks |

### Realtime

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/ws/tickets` | Short-lived WS ticket |
| WS | `/v1/ws` | Subscribe `conversation:{id}`, presence/typing commands |

### Reactions & pins

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/conversations/{id}/messages/{messageId}/reactions` | Add reaction |
| DELETE | `/v1/conversations/{id}/messages/{messageId}/reactions/{emoji}` | Remove |
| GET | `/v1/conversations/{id}/messages/{messageId}/reactions` | List |
| POST | `/v1/conversations/{id}/pins` | Pin message (not guest) |
| DELETE | `/v1/conversations/{id}/pins/{messageId}` | Unpin |
| GET | `/v1/conversations/{id}/pins` | List pins |

### Media

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/media/uploads` | Presigned PUT session |
| POST | `/v1/media/uploads/{uploadId}/complete` | Finalize upload |
| DELETE | `/v1/media/uploads/{uploadId}` | Cancel pending |
| GET | `/v1/media/assets/{assetId}` | Metadata |
| POST | `/v1/media/assets/{assetId}/access` | Download URL (guest ACL on history) |

### Search

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/search/messages` | FTS + ACL (`conversationId`, filters) |

### Threads, polls, scheduled

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/conversations/{id}/threads` | Create thread on root message |
| GET | `/v1/conversations/{id}/threads` | List threads |
| POST | `/v1/conversations/{id}/polls` | Create poll message (not guest) |
| POST | `/v1/conversations/{id}/polls/{pollId}/votes` | Vote |
| POST | `/v1/conversations/{id}/polls/{pollId}/close` | Close poll |
| POST | `/v1/conversations/{id}/scheduled-messages` | Schedule send |
| GET | `/v1/conversations/{id}/scheduled-messages` | List own pending |
| DELETE | `/v1/conversations/{id}/scheduled-messages/{id}` | Cancel |

### ITSM (user Bearer)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/resources/preview` | Safe preview |
| POST | `/v1/resources/actions` | Desk action |
| GET/PUT/DELETE | `/v1/conversations/{id}/context-link` | Context link CRUD |
| GET | `/v1/conversations/{id}/messages/{messageId}/ticket-suggestion` | Staff suggestion |
| POST | `…/ticket-suggestion/confirm` | Confirm create ticket |
| POST | `/v1/conversations/{id}/tickets` | Create ticket from chat |

### ITSM (service client)

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/service/context-conversations` | Provision group for resource |
| POST | `/v1/service/incidents/p1-provision` | P1 incident room |

### Audit

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/audit?conversationId=` | Staff owner/admin audit log |

## Cross-cutting

- **Guests / policy:** DEC-0009, `STATUS-guests-policy.md`
- **Mentions / forward:** DEC-0010
- **Search FTS:** DEC-0011
- **Media lifecycle:** DEC-0012
- **Receipts / audit / retention:** DEC-0013
- **P1 / ticket suggest:** DEC-0014
- **Threads / polls / scheduled:** DEC-0015
- **Hardening / metrics:** DEC-0016, `STATUS-hardening.md`

## Как поднять локально

```bash
cd messenger.back
uvicorn src.main:app --host 127.0.0.1 --port 8000
python -m src.infra.outbox.relay
python scripts/e2e_smoke.py
```