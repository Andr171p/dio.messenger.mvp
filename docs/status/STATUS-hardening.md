# Status: Hardening / observability (Session 8)

- **Дата:** 2026-11-22
- **Решение:** [DEC-0016](../decisions/DEC-0016-hardening-observability.md)

## Observability

| Артефакт | Notes |
|---|---|
| `src/infra/observability/metrics.py` | In-process registry (Counter / Gauge / Histogram), Prometheus text 0.0.4 |
| `GET /v1/system/metrics` | Scrape per API instance (WS gauge — локальный реестр) |
| Instrumentation | `send_ack_latency`, `search_latency`, `ws_connections`, `sync_gap_total`, `snapshot_reset_total`, `upload_scan_failures_total`, `outbox_lag_seconds` (helper) |

OpenTelemetry не в зависимостях: при необходимости — `opentelemetry-instrumentation-fastapi` + экспорт в OTLP; текущие метрики остаются scrape-friendly.

## Checklist — multi-instance

- [x] ≥2 uvicorn workers / pods за балансировщиком — verified `:8000` + `:8002` (2026-11-22)
- [x] Redis pub/sub для realtime fanout (все инстансы) — shared Redis `:6381` on stand
- [x] Один или несколько `python -m src.infra.outbox.relay` (SKIP LOCKED) — relay running on stand
- [ ] WS sticky sessions **не обязательны** (ticket + Redis), но revoke — per-instance registry — follow multi_instance.md
- [x] `/v1/system/metrics` агрегировать на уровне Prometheus (sum/max by pod) — both instances expose metrics

## Checklist — load

| Сценарий | Что смотреть |
|---|---|
| 1:1 chat, sustained send | `messenger_send_ack_latency_seconds`, outbox lag, DB pool |
| Busy group (50+ members) | WS fanout lag, `messenger_ws_connections`, Rabbit queue depth |
| Search | `messenger_search_latency_seconds`, PostgreSQL FTS CPU |
| Reconnect storm | WS ticket rate, subscription churn, `sync_gap_total` / `snapshot_reset_total` |

## Checklist — fault injection

| Component | Inject | Expected |
|---|---|---|
| PostgreSQL | pause / connection drop | 5xx or pool timeout; relay retries |
| Redis | down | Ephemeral (presence/typing) degraded; fanout may stall |
| RabbitMQ | broker down | Outbox rows accumulate; `set_outbox_lag_seconds` rises when wired |
| S3 | deny PUT/GET | Media pending/reject; upload scan failures counter |

## ACL / unit suite

- `tests/unit/test_acl_hardening.py` — guest @all, guest media window, forwarding deny, `principal_kind`, P1, search criteria builders

## Known risks

- In-process metrics не shared между инстансами (by design for MVP).
- `snapshot_reset_total` инкрементируется на **любой** snapshot fetch (не только после gap) — трактовать как resync volume, не как уникальные клиенты.
- Outbox lag gauge требует явного вызова `set_outbox_lag_seconds` из relay (hook documented in DEC-0016).
- Нет rate limiting / WAF на API — см. `TEST_PLAN.md` security backlog.

## Tests

```bash
cd messenger.back
pytest tests/unit -q
```