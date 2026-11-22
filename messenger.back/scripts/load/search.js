/**
 * k6 — search latency (verification P4).
 *
 * Usage:
 *   k6 run -e TOKEN=... -e API=http://127.0.0.1:8000 -e Q=hello scripts/load/search.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
  },
};

const API = __ENV.API || "http://127.0.0.1:8000";
const TOKEN = __ENV.TOKEN;
const Q = __ENV.Q || "hello";

export default function () {
  if (!TOKEN) {
    throw new Error("TOKEN env required");
  }
  const res = http.get(`${API}/v1/search/messages?q=${encodeURIComponent(Q)}&limit=20`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, { "search 200": (r) => r.status === 200 });
  sleep(0.1);
}
