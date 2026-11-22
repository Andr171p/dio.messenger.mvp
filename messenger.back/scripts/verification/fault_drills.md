# P5 — Fault injection drills

Record date, SHA, and pass/fail for each drill.

## F-1 RabbitMQ down 2–5 min

1. Send several messages (API up).
2. `docker stop dio-messenger-rabbitmq-1`.
3. Observe outbox rows accumulate (DB / metrics).
4. `docker start dio-messenger-rabbitmq-1`; wait for relay reconnect.
5. Confirm events fanout / manifest high-water catches up; no lost committed messages.

**Result:**

## F-2 Redis down

1. Subscribe WS + typing.
2. `docker stop dio-messenger-redis-1`.
3. Expect presence/typing degrade; `GET history` / sync still works.
4. Restart Redis; reconnect WS.

**Result:**

## F-3 API kill after commit (idempotent retry)

1. Send with `clientMessageId=X`; note message id.
2. Kill API process immediately after 201 (or simulate lost response).
3. Restart API; retry same payload.
4. Expect same message id; no duplicate.

**Result:**

## F-4 Relay kill mid-batch

1. Two relays running; burst send.
2. Kill one relay mid-flight.
3. Peer continues SKIP LOCKED; backlog drains.

**Result:**

## F-5 S3 GET deny

1. Complete upload to ready; then break S3 credentials or stop rustfs briefly.
2. `POST .../media/{id}/access` fails; text send still works.

**Result:**

## F-6 Retention prune + stale cursor

1. Set `EVENT_RETENTION_DAYS=0` or `1`, `MIN_RETAINED_EVENTS=5` on stand.
2. Generate >5 events; run `python -m src.infra.retention.worker` (one tick / short run).
3. `GET .../events?afterSeq=0` (or before min) → `snapshot_required`.
4. Snapshot endpoint still returns messages.

**Result:**
