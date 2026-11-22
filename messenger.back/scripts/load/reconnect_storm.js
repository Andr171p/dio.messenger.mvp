/**
 * k6 — reconnect storm via WS tickets (verification P4).
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 50 },
    { duration: "20s", target: 100 },
    { duration: "10s", target: 0 },
  ],
};

const API = __ENV.API || "http://127.0.0.1:8000";
const TOKEN = __ENV.TOKEN;

export default function () {
  if (!TOKEN) {
    throw new Error("TOKEN env required");
  }
  const ticket = http.post(`${API}/v1/ws/tickets`, null, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(ticket, { "ticket 201": (r) => r.status === 201 });

  const manifest = http.get(`${API}/v1/sync/manifest`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(manifest, { "manifest 200": (r) => r.status === 200 });
  sleep(0.05);
}
