import type { AccountKey, SendMessageAck } from "../models/types.js";
import { parseComposerContent, textBlocks } from "../content/blocks.js";
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

  private async resolveReplyServerId(
    replyToId: string | undefined,
    replyToLocalId: string | undefined,
  ): Promise<string | undefined> {
    if (replyToId && looksLikeUuid(replyToId)) {
      return replyToId;
    }
    const localKey = replyToLocalId ?? replyToId;
    if (!localKey) return undefined;
    const parent = await this.deps.db.messages.get(localKey);
    if (parent?.serverId) return parent.serverId;
    // Still pending ACK — defer
    return undefined;
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
        const {
          conversationId,
          clientMessageId,
          content,
          replyToId,
          replyToLocalId,
          mentions,
          mentionAll,
          forwardedFrom,
          quoteText,
          blocksJson,
        } = item.command.payload;

        const resolvedReply = await this.resolveReplyServerId(replyToId, replyToLocalId);
        if ((replyToId || replyToLocalId) && !resolvedReply) {
          // Wait for parent ACK
          await this.deps.db.outbox.update(id, {
            status: "pending",
            nextAttemptAt: Date.now() + 1_500,
            leaseUntil: undefined,
            lastError: "waiting_reply_ack",
          });
          return;
        }

        await this.deps.db.messages
          .where("[accountKey+clientMessageId]")
          .equals([this.deps.accountKey, clientMessageId])
          .modify({ sendStatus: "sending" });

        const blocks = blocksJson
          ? (JSON.parse(blocksJson) as unknown[])
          : parseComposerContent(content);

        const body: Record<string, unknown> = {
          clientMessageId,
          blocks,
        };
        if (resolvedReply) body.replyToId = resolvedReply;
        if (mentions?.length) body.mentions = mentions;
        if (mentionAll) body.mentionAll = true;
        if (forwardedFrom) body.forwardedFrom = forwardedFrom;
        if (quoteText) {
          body.blocks = [
            { type: "quote", text: quoteText },
            ...((body.blocks as unknown[]) ?? textBlocks(content)),
          ];
        }

        const dto = await this.deps.http.post<ServerMessageDTO>(
          `/v1/conversations/${conversationId}/messages`,
          body,
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
            json: { blocks: parseComposerContent(content) },
          },
        );
        await this.deps.db.outbox.delete(id);
      } else if (item.type === "message.delete" && item.command.type === "message.delete") {
        const { conversationId, messageId, localId, previousContent } = item.command.payload;
        try {
          await this.deps.http.request(
            `/v1/conversations/${conversationId}/messages/${messageId}`,
            { method: "DELETE" },
          );
          await this.deps.db.outbox.delete(id);
        } catch (error) {
          if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
            await this.deps.db.messages.update(localId, {
              deletedAt: undefined,
              content: previousContent,
            });
            await this.deps.db.outbox.delete(id);
            return;
          }
          throw error;
        }
      } else if (
        (item.type === "reaction.toggle" ||
          item.type === "reaction.add" ||
          item.type === "reaction.remove") &&
        (item.command.type === "reaction.toggle" ||
          item.command.type === "reaction.add" ||
          item.command.type === "reaction.remove")
      ) {
        const { conversationId, messageId, emoji } = item.command.payload;
        const remove =
          item.command.type === "reaction.remove" ||
          (item.command.type === "reaction.toggle" &&
            "remove" in item.command.payload &&
            item.command.payload.remove);

        if (remove) {
          await this.deps.http.request(
            `/v1/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
            { method: "DELETE" },
          );
        } else {
          await this.deps.http.post(`/v1/conversations/${conversationId}/reactions`, {
            messageId,
            emoji,
          });
        }
        await this.deps.db.outbox.delete(id);
      } else if (item.type === "message.pin" && item.command.type === "message.pin") {
        const { conversationId, messageId } = item.command.payload;
        await this.deps.http.post(`/v1/conversations/${conversationId}/pins`, {
          messageId,
        });
        await this.deps.db.outbox.delete(id);
      } else if (item.type === "message.unpin" && item.command.type === "message.unpin") {
        const { conversationId, messageId } = item.command.payload;
        await this.deps.http.request(
          `/v1/conversations/${conversationId}/messages/${messageId}/pins`,
          { method: "DELETE" },
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
        if (item.command.type === "message.delete") {
          await this.deps.db.messages.update(item.command.payload.localId, {
            deletedAt: undefined,
            content: item.command.payload.previousContent,
          });
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

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
