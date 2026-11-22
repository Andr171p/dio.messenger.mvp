# P3 — Multi-instance verification runbook

## Stand

```bash
# Terminal A — API instance 1
cd messenger.back
uvicorn src.main:app --host 127.0.0.1 --port 8000

# Terminal B — API instance 2
uvicorn src.main:app --host 127.0.0.1 --port 8002

# Terminal C/D — relays (SKIP LOCKED)
python -m src.infra.outbox.relay
# optional second relay process
python -m src.infra.outbox.relay
```

Shared: Postgres `:5434`, Redis `:6381`, RabbitMQ `:5674`, S3 `:9010` (docker compose).

## Checks

| # | Steps | Expect | Result |
|---|---|---|---|
| 1 | WS subscribe on :8002; send message via :8000 | `message.created` on WS | |
| 2 | Kick member via :8000 while subscribed on :8002 | `access.revoked` / `member.removed` | |
| 3 | Two relays running; burst send | outbox drains; no stuck rows | |
| 4 | `GET :8000/v1/system/metrics` and `:8002/...` | both expose metrics; aggregate by hand | |

## Config to record

- API ports: 8000 / 8002
- Relay count:
- SHA / date:
