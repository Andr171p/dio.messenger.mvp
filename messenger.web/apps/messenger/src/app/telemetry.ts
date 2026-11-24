import { getRuntimeConfig } from "./runtimeConfig.js";

type Failure =
  | "sync_failed"
  | "session_refresh_failed"
  | "outbox_retry"
  | "outbox_rejected"
  | "app_update_failed"
  | "render_failed";

type Timing = "send_ack" | "sync_recovery";

const sentAt = new Map<Failure, number>();

export function reportFailure(code: Failure): void {
  const now = Date.now();
  if (now - (sentAt.get(code) ?? 0) < 30_000) return;
  sentAt.set(code, now);
  publish({ code });
}

export function reportTiming(code: Timing, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0 || Math.random() >= 0.1) return;
  publish({ code, durationMs: Math.round(durationMs) });
}

function publish(event: { code: Failure | Timing; durationMs?: number }) {
  const url = getRuntimeConfig().telemetry ?? import.meta.env.VITE_TELEMETRY_URL;
  if (!url || !import.meta.env.PROD) return;
  void fetch(url, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({
      ...event,
      release: import.meta.env.VITE_RELEASE ?? "unknown",
    }),
  }).catch(() => undefined);
}
