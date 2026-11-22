/**
 * k6 — 1:1 sustained send (verification P4).
 *
 * Usage:
 *   k6 run -e TOKEN=... -e API=http://127.0.0.1:8000 -e CONVERSATION_ID=... scripts/load/send_1to1.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
  },
};

const API = __ENV.API || "http://127.0.0.1:8000";
const TOKEN = __ENV.TOKEN;
const CONVERSATION_ID = __ENV.CONVERSATION_ID;

export default function () {
  if (!TOKEN || !CONVERSATION_ID) {
    throw new Error("TOKEN and CONVERSATION_ID env required");
  }
  const res = http.post(
    `${API}/v1/conversations/${CONVERSATION_ID}/messages`,
    JSON.stringify({
      clientMessageId: uuidv4(),
      blocks: [{ type: "text", text: `k6 ${__VU}-${__ITER}` }],
    }),
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
  check(res, { "send 201": (r) => r.status === 201 });
  sleep(0.2);
}
