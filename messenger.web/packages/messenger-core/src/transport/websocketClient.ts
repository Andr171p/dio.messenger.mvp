import type { ConversationEvent } from "../models/types.js";
import type { HttpClient } from "./httpClient.js";

interface WsTicketResponse {
  ticket: string;
  expiresAt: string;
  expiresIn?: number;
}

export type WsEventHandler = (event: ConversationEvent) => void;

export interface WebSocketClientOptions {
  http: HttpClient;
  wsBaseUrl: string;
  onConnectionChange?: (connected: boolean) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEvent(raw: Record<string, unknown>): ConversationEvent | null {
  const nested = asRecord(raw.payload);
  const conversationId =
    (typeof raw.conversationId === "string" && raw.conversationId) ||
    (nested && typeof nested.conversationId === "string" && nested.conversationId) ||
    null;

  const eventSeqRaw = raw.eventSeq ?? raw.seq ?? nested?.eventSeq ?? nested?.seq;
  const eventSeq =
    typeof eventSeqRaw === "number"
      ? eventSeqRaw
      : typeof eventSeqRaw === "string"
        ? Number(eventSeqRaw)
        : NaN;

  if (!conversationId || !Number.isFinite(eventSeq)) {
    return null;
  }

  const type =
    (typeof raw.type === "string" && raw.type !== "event" ? raw.type : null) ||
    (nested && typeof nested.type === "string" ? nested.type : null) ||
    "message.created";

  const payload =
    nested && (nested.payload === undefined || typeof nested.payload === "object")
      ? ((nested.payload as Record<string, unknown> | undefined) ?? nested)
      : raw;

  return {
    conversationId,
    eventSeq,
    eventId: String(raw.eventId ?? raw.id ?? nested?.id ?? crypto.randomUUID()),
    type: type as ConversationEvent["type"],
    payload,
  };
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<WsEventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private conversationKeys = new Set<string>();

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

  sendTyping(conversationId: string, started: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        id: crypto.randomUUID(),
        type: started ? "typing.started" : "typing.stopped",
        payload: { conversationId },
      }),
    );
  }

  async connect(): Promise<void> {
    this.stopped = false;
    await this.openSocket();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.options.onConnectionChange?.(false);
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

    const { ticket } = await this.options.http.post<WsTicketResponse>("/v1/ws/tickets");

    const url = new URL(this.options.wsBaseUrl);
    url.searchParams.set("ticket", ticket);

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.options.onConnectionChange?.(true);
      this.resubscribeAll();
    });

    socket.addEventListener("message", (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as Record<string, unknown>;
        const type = typeof envelope.type === "string" ? envelope.type : "";
        if (
          type.startsWith("subscription.") ||
          type.startsWith("typing.") ||
          type.startsWith("presence.")
        ) {
          return;
        }

        const candidates: Record<string, unknown>[] = [envelope];
        const payload = asRecord(envelope.payload);
        if (payload) candidates.unshift(payload);

        for (const candidate of candidates) {
          const event = normalizeEvent(candidate);
          if (!event) continue;
          for (const handler of this.handlers) {
            handler(event);
          }
          break;
        }
      } catch {
        // ignore malformed frames in MVP
      }
    });

    socket.addEventListener("close", () => {
      this.options.onConnectionChange?.(false);
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(() => {
          void this.openSocket();
        }, 2_000);
      }
    });
  }
}
