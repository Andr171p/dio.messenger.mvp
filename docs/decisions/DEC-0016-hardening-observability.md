# DEC-0016 — Hardening observability (Session 8)

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** Pre-frontend hardening; minimal deps (`pyproject.toml` без `prometheus_client`)

## Решение

1. **Metrics registry** — lightweight in-process `MetricsRegistry` в `src/infra/observability/metrics.py` с Prometheus text exposition (0.0.4).
2. **HTTP** — `GET /v1/system/metrics` (system router), без auth на MVP (допускается network policy / ingress allowlist).
3. **Counters / histograms**
   - `messenger_send_ack_latency_seconds` — around `POST …/messages` in API router.
   - `messenger_search_latency_seconds` — `GET /v1/search/messages`.
   - `messenger_ws_connections` — gauge from `WsSessionRegistry.connection_count`.
   - `messenger_sync_gap_total` — when `SnapshotRequiredError` raised in event delta.
   - `messenger_snapshot_reset_total` — on `get_conversation_snapshot`.
   - `messenger_upload_scan_failures_total` — media worker reject paths.
   - `messenger_outbox_lag_seconds` — gauge helper `set_outbox_lag_seconds()` for relay/worker to call when measuring oldest pending row age.
4. **ACL tests** — `tests/unit/test_acl_hardening.py` + pure `is_media_visible_to_guest` / `application/search/criteria.py`.
5. **OpenTelemetry** — not wired; add OTLP exporter later without changing metric names if possible.

## Альтернативы

- `prometheus_client` — отвергнуто для Session 8 (zero new deps); миграция возможна, сохранив имена метрик.
- Pushgateway — не нужен для API scrape; outbox relay может остаться pull-only sidecar.

## Последствия

- Per-pod scraping required for accurate WS connection counts.
- Snapshot metric over-counts if clients poll snapshot routinely — track in ops notes / metrics dashboard.