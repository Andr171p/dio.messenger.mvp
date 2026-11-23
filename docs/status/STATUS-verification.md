# Status: Backend verification (P0–P8)

- **Дата:** 2026-11-22
- **SHA:** n/a (workspace без `.git`)
- **План:** Backend verification (без AV / multi-tenant org / service-auth)
- **Стенд:** DioDesk IAM `:8001`; Messenger API `:8000` (+ `:8002` multi-instance); Postgres `5434`; Redis `6381`; Rabbit `5674`; S3/RustFS `9010`
- **Alembic head:** `i9c0d1e2f3a4`

## Summary

| Phase | Result | Notes |
|-------|--------|-------|
| P0 Unit | **PASS** | `65` tests with integration included; unit alone historically `58` |
| P1 Smoke | **PASS** | Expanded `scripts/e2e_smoke.py` — ALL SMOKE CHECKS PASSED |
| P2 ACL integration | **PASS** | `7 passed, 1 skipped` (`test_acl_http` skip without live token env) |
| P3 Multi-instance | **PASS** (partial) | API `:8000` + `:8002` live; metrics both `200`; runbook for WS cross-instance |
| P4 Load | **SCRIPTS READY** | k6 not installed on host; profiles in `scripts/load/` |
| P5 Fault | **RUNBOOK READY** | `scripts/verification/fault_drills.md` — execute before pilot |
| P6 Security ops | **DOCUMENTED** | AuthZ covered by smoke+integration; rate-limit = open risk; backup runbook |
| P7 Retention/audit | **PASS** | Integration `test_retention_audit.py` |
| P8 CI | **READY** | `.github/workflows/messenger-backend.yml` |

**Пилот-критерий плана:** P0–P3, P6 (authZ+docs), P7 green; P4–P5 артефакты + явные risks; P8 workflow — **достигнут на уровне артефактов/автотестов**. Полноценные load/fault цифры — следующий прогон с k6 и оператором drills.

## P0 — Unit baseline

```text
pytest tests/unit -q  → 58 passed (earlier)
pytest tests/unit tests/integration -q  → 65 passed, 1 skipped
```

## P1 — Stand smoke

Workers used: outbox relay (running), media worker (started for smoke).

Expanded checks beyond classic smoke: policy, pin, search, delivery-cursor, ticket-suggestion, thread, scheduled cancel, `/v1/system/metrics`, `hasExternalMembers`.

```bash
cd messenger.back
alembic upgrade head   # i9c0d1e2f3a4
uvicorn ...
python -m src.infra.outbox.relay
python -m src.infra.media.worker
python scripts/e2e_smoke.py
```

**Result:** ALL SMOKE CHECKS PASSED (2026-11-22).

## P2 — Integration ACL / correctness

Location: `messenger.back/tests/integration/`

| Test | Status |
|------|--------|
| Idempotent send / conflict | PASS |
| Guest history_from_seq | PASS |
| Forward policy deny | PASS |
| Media not ready | PASS |
| Delivery cursor monotonic | PASS |
| Search ACL / FTS | PASS |
| Retention min events + audit row | PASS |
| Live HTTP non-member (MESSENGER_API_URL) | SKIPPED without env |

```bash
set INTEGRATION=1
pytest tests/integration -q
```

## P3 — Multi-instance

Runbook: [`messenger.back/scripts/verification/multi_instance.md`](../../messenger.back/scripts/verification/multi_instance.md)

Verified this session:

- `:8000/health/live` → 200
- `:8002/health/live` → 200
- both `/v1/system/metrics` → 200 (histograms present on `:8002`)

Remaining operator checks (WS A→B fanout, kick revoke, dual relay): follow runbook checklist.

## P4 — Load (прогон 2026-11-22, k6 v2.4.0)

Стенд: 1× API `:8000`, локальный docker Postgres/Redis/Rabbit; seed ~50 msgs; conversation `01a203b5-d332-76b3-bf11-946d70403650`.

| Workload | Profile | med (≈p50) | p95 | avg | Success | vs ARCHITECTURE SLO |
|----------|---------|------------|-----|-----|---------|---------------------|
| 1:1 send | 5 VU × 30s | **102 ms** | **301 ms** | 141 ms | 99.77% (441/442) | SLO send ACK p95 **150–200 ms** — **не уложились** |
| Busy group | 20 VU × 45s | **321 ms** | **1.02 s** | 443 ms | 99.72% (1825/1830) | hot-conversation; ожидаемо хуже 1:1 |
| Search | 10 VU × 30s, `q=hello` | **34 ms** | **94 ms** | 43 ms | 100% (2084/2084) | SLO search p95 **&lt;500 ms** — **OK** (малый корпус) |
| Reconnect storm | ramp → 100 VU, ticket+manifest | **84 ms** | **1.94 s** | 577 ms | 100% (3840/3840) | SLO reconnect **&lt;2 s** — p95 на грани под пиком 100 VU |

k6 thresholds: `send_1to1` / `search` `p(95)<500` — **pass**; busy `error rate&lt;5%` — **pass**.

## P5 — Fault drills

Runbook: [`messenger.back/scripts/verification/fault_drills.md`](../../messenger.back/scripts/verification/fault_drills.md)

| Drill | Status |
|-------|--------|
| Rabbit down | pending operator |
| Redis down | pending operator |
| API kill + idempotent retry | covered partially by smoke idempotent send |
| Relay kill SKIP LOCKED | pending operator |
| S3 deny | pending operator |
| Retention stale cursor | covered by P7 integration logic |

## P6 — Security ops

**AuthZ regression:** smoke (kick/revoke, guest-related surface) + integration ACL + unit `test_acl_hardening.py`.

**Rate limiting:** **gap** — no API/WS rate limits in code; documented as open risk for pilot (WAF/proxy recommended).

**Logging hygiene:** checklist in [`backup_restore.md`](../../messenger.back/scripts/verification/backup_restore.md) — sample before pilot.

**Backup/restore:** runbook ready (`pg_dump` / `pg_restore`).

## P7 — Retention / audit

Integration proves: prune keeps `MIN` events; min seq rises (stale cursor → snapshot path); audit row insert works.

Worker: `python -m src.infra.retention.worker` (config `EVENT_RETENTION_DAYS`, `MIN_RETAINED_EVENTS`).

## P8 — CI

[`.github/workflows/messenger-backend.yml`](../.github/workflows/messenger-backend.yml):

1. Ruff check + format
2. `pytest tests/unit`
3. Services postgres:18 + redis + rabbitmq → `alembic upgrade head` → `INTEGRATION=1 pytest tests/integration`

## Open risks (in scope of this plan)

1. Load p95 numbers not yet measured (k6 missing on host).
2. Full fault drills need operator time on docker compose.
3. Rate limiting absent (explicit non-blocker for report; risk for public exposure).
4. Out of scope by design: real AV, multi-tenant org claim, service client credentials.

## How to finish remaining operator items

```bash
# Load (after installing k6)
k6 run -e TOKEN=$TOKEN -e CONVERSATION_ID=$CID -e API=http://127.0.0.1:8000 scripts/load/send_1to1.js

# Fault / backup
# follow scripts/verification/fault_drills.md and backup_restore.md
# tick checkboxes in multi_instance.md
```
