from src.infra.observability.metrics import METRICS, inc_sync_gap, observe_send_ack_latency, set_outbox_lag_seconds


def test_metrics_prometheus_exposition() -> None:
    observe_send_ack_latency(0.12)
    inc_sync_gap()
    set_outbox_lag_seconds(1.5)
    body = METRICS.render_prometheus()
    assert "messenger_send_ack_latency_seconds" in body
    assert "messenger_sync_gap_total" in body
    assert "messenger_outbox_lag_seconds 1.5" in body