import { describe, expect, it } from "vitest";
import { applyEvent } from "../sync/applyEvent.js";
import { SyncGapError } from "../sync/errors.js";
import { openMessengerDatabase } from "../storage/database.js";

describe("applyEvent", () => {
  const accountKey = "user-1";
  const conversationId = "conv-1";

  it("advances cursor when event is sequential", async () => {
    const db = openMessengerDatabase(`${accountKey}-sequential`);
    await applyEvent(db, accountKey, {
      conversationId,
      eventSeq: 1,
      eventId: "e1",
      type: "message.created",
      payload: {
        messageId: "m1",
        clientMessageId: "c1",
        content: "Hi",
        authorId: "a1",
        createdSeq: 1,
        isOutgoing: false,
      },
    });

    const cursor = await db.syncCursors.get([accountKey, conversationId]);
    expect(cursor?.eventSeq).toBe(1);
    const message = await db.messages.where("localId").equals("c1").first();
    expect(message?.content).toBe("Hi");
  });

  it("ignores duplicate events", async () => {
    const db = openMessengerDatabase(`${accountKey}-dup`);
    const event = {
      conversationId,
      eventSeq: 1,
      eventId: "e1",
      type: "message.created" as const,
      payload: {
        messageId: "m1",
        content: "Once",
        authorId: "a1",
        createdSeq: 1,
      },
    };
    await applyEvent(db, accountKey, event);
    await applyEvent(db, accountKey, event);
    const count = await db.messages.count();
    expect(count).toBe(1);
  });

  it("throws on gap", async () => {
    const db = openMessengerDatabase(`${accountKey}-gap`);
    await expect(
      applyEvent(db, accountKey, {
        conversationId,
        eventSeq: 2,
        eventId: "e2",
        type: "message.created",
        payload: { messageId: "m2", content: "late", authorId: "a1" },
      }),
    ).rejects.toBeInstanceOf(SyncGapError);
  });
});