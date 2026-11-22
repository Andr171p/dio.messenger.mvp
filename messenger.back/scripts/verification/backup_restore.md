# P6 — Backup / restore drill

## Steps

```bash
# Dump
docker exec dio-messenger-postgres-1 pg_dump -U messenger -d messenger -Fc -f /tmp/messenger.dump
docker cp dio-messenger-postgres-1:/tmp/messenger.dump ./messenger.dump

# Restore to clean DB (example: new database messenger_restore)
docker exec -i dio-messenger-postgres-1 psql -U messenger -c "CREATE DATABASE messenger_restore;"
docker exec -i dio-messenger-postgres-1 pg_restore -U messenger -d messenger_restore --clean --if-exists /tmp/messenger.dump
```

Point a temporary API at `POSTGRES_DB=messenger_restore` (or swap DB) and:

1. `GET /v1/sync/manifest` — conversations present.
2. Open a known conversation history — messages readable.
3. Memberships intact.

## Observations

| Metric | Value |
|--------|-------|
| Dump wall time | |
| Restore wall time | |
| Approx RPO | last successful dump |
| Approx RTO | restore + API restart |
| Result | |

## Logging hygiene checklist

- [ ] Sample API logs: no message plaintext bodies
- [ ] No `Authorization: Bearer` values in logs
- [ ] Metrics exposition has no secret content
