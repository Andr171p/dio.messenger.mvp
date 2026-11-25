import type { ConversationActivity, ConversationEvent } from "../models/types.js";
import type { HttpClient } from "./httpClient.js";

interface WsTicketResponse {
  ticket: string;
  expiresAt: string;
  expiresIn?: number;
}

export type WsEventHandler = (event: ConversationEvent) => void;

export type WsEphemeralHandler = (event: {
  type: string;
  payload: Record<string, unknown>;
}) => void;

export type WsAccessRevokedHandler = (payload: { conversationId: string }) => void;

export interface WebSocketClientOptions {
  http: HttpClient;
  wsBaseUrl: string;
  onConnectionChange?: (connected: boolean) => void;
  onEphemeral?: WsEphemeralHandler;
  onAccessRevoked?: WsAccessRevokedHandler;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickConversationId(
  envelope: Record<string, unknown>,
  payload: Record<string, unknown> | null,
): string | null {
  if (typeof envelope.conversationId === "string") return envelope.conversationId;
  if (payload && typeof payload.conversationId === "string") {
    return payload.conversationId;
  }
  return null;
}

function pickEventSeq(
  envelope: Record<string, unknown>,
  payload: Record<string, unknown> | null,
): number | null {
  const raw = envelope.eventSeq ?? envelope.seq ?? payload?.eventSeq ?? payload?.seq;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

/**
 * Normalize durable WS frames. Keeps outer envelope `type` (never default to message.created).
 * Compact fanout payloads live in envelope.payload.
 */
export function normalizeDurableEvent(
  envelope: Record<string, unknown>,
): ConversationEvent | null {
  const type = typeof envelope.type === "string" ? envelope.type : "";
  if (!type || type.startsWith("subscription.") || type === "access.revoked") {
    return null;
  }
  if (
    type.startsWith("typing.") ||
    type.startsWith("presence.") ||
    type.startsWith("receipt.")
  ) {
    return null;
  }

  const payload = asRecord(envelope.payload) ?? {};
  const conversationId = pickConversationId(envelope, payload);
  const eventSeq = pickEventSeq(envelope, payload);
  if (!conversationId || eventSeq === null) {
    return null;
  }

  return {
    conversationId,
    eventSeq,
    eventId: String(
      envelope.id ?? envelope.eventId ?? payload.id ?? crypto.randomUUID(),
    ),
    type: type as ConversationEvent["type"],
    payload: {
      ...payload,
      conversationId,
      eventSeq,
    },
    compact: true,
  };
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<WsEventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private conversationKeys = new Set<string>();
  private presencePingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;

  constructor(private readonly options: WebSocketClientOptions) {}

  subscribe(handler: WsEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeConversation(conversationId: string): void {
    this.conversationKeys.add(conversationId);
    this.sendSubscribe(conversationId);
  }

  unsubscribeConversation(conversationId: string): void {
    this.conversationKeys.delete(conversationId);
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "subscription.unsubscribe",
        payload: { topic: "conversation", key: conversationId },
      }),
    );
  }

  sendTyping(
    conversationId: string,
    started: boolean,
    activity?: ConversationActivity,
  ): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: started ? "typing.started" : "typing.stopped",
        payload: { conversationId, activity },
      }),
    );
  }

  sendPresencePing(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "presence.ping",
        payload: {},
      }),
    );
  }

  async connect(): Promise<void> {
    this.stopped = false;
    this.reconnectAttempt = 0;
    await this.openSocket();
  }

  disconnect(): void {
    this.stopped = true;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.presencePingTimer) {
      clearInterval(this.presencePingTimer);
      this.presencePingTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.options.onConnectionChange?.(false);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const attempt = this.reconnectAttempt;
    this.reconnectAttempt = Math.min(attempt + 1, 8);
    const delay = Math.min(30_000, 1_000 * 2 ** attempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket().catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private sendSubscribe(conversationId: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "subscription.subscribe",
        payload: { topic: "conversation", key: conversationId },
      }),
    );
  }

  private resubscribeAll(): void {
    for (const conversationId of this.conversationKeys) {
      this.sendSubscribe(conversationId);
    }
  }

  private async openSocket(): Promise<void> {
    if (this.stopped) return;

    let ticket: string;
    try {
      const response = await this.options.http.post<WsTicketResponse>("/v1/ws/tickets");
      if (typeof response.ticket !== "string" || !response.ticket.trim()) {
        throw new Error("Missing WebSocket ticket");
      }
      ticket = response.ticket;
    } catch {
      this.options.onConnectionChange?.(false);
      this.scheduleReconnect();
      return;
    }

    const url = new URL(this.options.wsBaseUrl);
    url.searchParams.set("ticket", ticket);

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.options.onConnectionChange?.(true);
      this.resubscribeAll();
      this.sendPresencePing();
      if (this.presencePingTimer) clearInterval(this.presencePingTimer);
      this.presencePingTimer = setInterval(() => this.sendPresencePing(), 30_000);
    });

    socket.addEventListener("message", (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as Record<string, unknown>;
        const type = typeof envelope.type === "string" ? envelope.type : "";
        const payload = asRecord(envelope.payload) ?? {};

        if (
          type.startsWith("subscription.") ||
          type === "typing.ack" ||
          type === "presence.pong"
        ) {
          return;
        }

        if (type === "access.revoked") {
          const conversationId = pickConversationId(envelope, payload);
          if (conversationId) {
            this.options.onAccessRevoked?.({ conversationId });
          }
          return;
        }

        if (
          type === "typing.updated" ||
          type === "recording_audio.updated" ||
          type === "presence.changed" ||
          type === "receipt.delivered_updated" ||
          type.startsWith("typing.") ||
          type.startsWith("presence.") ||
          type.startsWith("receipt.")
        ) {
          this.options.onEphemeral?.({ type, payload: { ...payload, type } });
          return;
        }

        const event = normalizeDurableEvent(envelope);
        if (!event) return;
        for (const handler of this.handlers) {
          handler(event);
        }
      } catch {
        // ignore malformed frames
      }
    });

    socket.addEventListener("close", () => {
      this.options.onConnectionChange?.(false);
      if (this.presencePingTimer) {
        clearInterval(this.presencePingTimer);
        this.presencePingTimer = null;
      }
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // close handler schedules reconnect
    });
  }
}
