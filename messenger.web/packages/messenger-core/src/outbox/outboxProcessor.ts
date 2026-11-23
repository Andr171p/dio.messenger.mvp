import type { AccountKey, SendMessageAck } from "../models/types.js";
import { textBlocks } from "../content/blocks.js";
import type { MessengerDatabase } from "../storage/database.js";
import { HttpClient, HttpError } from "../transport/httpClient.js";
import { reconcileSendAck } from "../sync/reconcileAck.js";
import { computeBackoffMs } from "./backoff.js";

const LOCK_NAME = "dio-messenger-outbox";

export interface OutboxProcessorDeps {
  db: MessengerDatabase;
  accountKey: AccountKey;
  http: HttpClient;
  onFlush?: () => void;
}

interface ServerMessageDTO {
  id: string;
  clientMessageId: string;
  createdSeq: number;
  eventSeq: number;
  revision: number;
}

export class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopRequested = false;

  constructor(private readonly deps: OutboxProcessorDeps) {}

  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.stopRequested = false;
    this.timer = setInterval(() => {
      void this.flush();
    }, intervalMs);
    void this.flush();
  }

  stop(): void {
    this.stopRequested = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  requestFlush(): void {
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.running || this.stopRequested) return;

    const run = async () => {
      this.running = true;
      try {
        await this.processDueItems();
      } finally {
        this.running = false;
        this.deps.onFlush?.();
      }
    };

    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      await navigator.locks.request(
        `${LOCK_NAME}:${this.deps.accountKey}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          await run();
        },
      );
    } else {
      await run();
    }
  }

  private async processDueItems(): Promise<void> {
    const now = Date.now();
    const items = await this.deps.db.outbox
      .where("accountKey")
      .equals(this.deps.accountKey)
      .filter(
        (item) =>
          (item.status === "pending" || item.status === "processing") &&
          item.nextAttemptAt <= now,
      )
      .toArray();

    for (const item of items.slice(0, 5)) {
      await this.processItem(item.id, now);
    }
  }

  private async processItem(id: string, now: number): Promise<void> {
    const item = await this.deps.db.outbox.get(id);
    if (!item || item.accountKey !== this.deps.accountKey) return;
    if (item.status !== "pending" && item.status !== "processing") return;
    if (item.nextAttemptAt > now) return;

    if (item.status === "processing" && item.leaseUntil && item.leaseUntil > now) {
      return;
    }

    const leaseUntil = now + 30_000;
    await this.deps.db.outbox.update(id, {
      status: "processing",
      leaseUntil,
    });

    try {
      if (item.type === "message.send" && item.command.type === "message.send") {
        const { conversationId, clientMessageId, content, replyToId } =
          item.command.payload;

        await this.deps.db.messages
          .where("[accountKey+clientMessageId]")
          .equals([this.deps.accountKey, clientMessageId])
          .modify({ sendStatus: "sending" });

        const dto = await this.deps.http.post<ServerMessageDTO>(
          `/v1/conversations/${conversationId}/messages`,
          {
            clientMessageId,
            blocks: textBlocks(content),
            ...(replyToId !== undefined ? { replyToId } : {}),
          },
        );

        const ack: SendMessageAck = {
          messageId: dto.id,
          clientMessageId: dto.clientMessageId,
          createdSeq: dto.createdSeq,
          eventSeq: dto.eventSeq,
        };

        await reconcileSendAck(this.deps.db, this.deps.accountKey, ack, id);
      } else if (item.type === "message.edit" && item.command.type === "message.edit") {
        const { conversationId, messageId, content } = item.command.payload;
        await this.deps.http.request(
          `/v1/conversations/${conversationId}/messages/${messageId}`,
          {
            method: "PATCH",
            json: { blocks: textBlocks(content) },
          },
        );
        await this.deps.db.outbox.delete(id);
      } else if (item.type === "message.delete" && item.command.type === "message.delete") {
        const { conversationId, messageId } = item.command.payload;
        await this.deps.http.request(
          `/v1/conversations/${conversationId}/messages/${messageId}`,
          { method: "DELETE" },
        );
        await this.deps.db.outbox.delete(id);
      } else if (
        item.type === "reaction.toggle" &&
        item.command.type === "reaction.toggle"
      ) {
        const { conversationId, messageId, emoji } = item.command.payload;
        await this.deps.http.post(
          `/v1/conversations/${conversationId}/messages/${messageId}/reactions`,
          { emoji },
        );
        await this.deps.db.outbox.delete(id);
      } else {
        await this.deps.db.outbox.delete(id);
      }
    } catch (error) {
      const attempts = item.attempts + 1;
      const nextAttemptAt = Date.now() + computeBackoffMs(attempts);
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof HttpError && error.status === 401) {
        await this.deps.db.outbox.update(id, {
          status: "pending",
          attempts,
          nextAttemptAt: Date.now() + 60_000,
          lastError: "unauthorized",
          leaseUntil: undefined,
        });
        return;
      }

      if (
        error instanceof HttpError &&
        (error.status === 403 || error.status === 409 || error.status === 422)
      ) {
        if (item.command.type === "message.send") {
          await this.deps.db.messages
            .where("[accountKey+clientMessageId]")
            .equals([this.deps.accountKey, item.command.payload.clientMessageId])
            .modify({ sendStatus: "failed" });
        }
        await this.deps.db.outbox.update(id, {
          status: "failed",
          attempts,
          lastError: message,
          leaseUntil: undefined,
        });
        return;
      }

      if (item.command.type === "message.send") {
        await this.deps.db.messages
          .where("[accountKey+clientMessageId]")
          .equals([this.deps.accountKey, item.command.payload.clientMessageId])
          .modify({ sendStatus: "retrying" });
      }

      await this.deps.db.outbox.update(id, {
        status: "pending",
        attempts,
        nextAttemptAt,
        lastError: message,
        leaseUntil: undefined,
      });
    }
  }
}
