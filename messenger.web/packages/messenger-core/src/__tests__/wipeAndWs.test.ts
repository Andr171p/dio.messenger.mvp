import { describe, expect, it } from "vitest";
import { openMessengerDatabase } from "../storage/database.js";
import { wipeConversation } from "../sync/wipeConversation.js";
import { normalizeDurableEvent } from "../transport/websocketClient.js";

describe("wipeConversation", () => {
  it("removes messages drafts outbox and cursor for conversation", async () => {
    const accountKey = "wipe-user";
    const conversationId = "conv-wipe";
    const db = openMessengerDatabase(`${accountKey}-wipe`);

    await db.messages.put({
      accountKey,
      localId: "m1",
      clientMessageId: "m1",
      conversationId,
      content: "secret",
      createdAt: Date.now(),
      revision: 1,
      sendStatus: "sent",
      isOutgoing: false,
      authorId: "a",
    });
    await db.drafts.put({
      id: `${accountKey}::${conversationId}`,
      accountKey,
      conversationId,
      content: "draft",
      updatedAt: Date.now(),
    });
    await db.outbox.put({
      id: "o1",
      accountKey,
      type: "message.send",
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      command: {
        type: "message.send",
        payload: {
          conversationId,
          clientMessageId: "c1",
          content: "x",
        },
      },
    });
    await db.syncCursors.put({ accountKey, conversationId, eventSeq: 3 });
    await db.conversations.put({
      accountKey,
      id: conversationId,
      title: "T",
      unreadCount: 0,
      isGuest: false,
      isPinned: false,
      updatedAt: Date.now(),
    });

    await wipeConversation(db, accountKey, conversationId);

    expect(await db.messages.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.syncCursors.count()).toBe(0);
    expect(await db.conversations.get(conversationId)).toBeUndefined();
  });
});

describe("normalizeDurableEvent", () => {
  it("keeps outer envelope type for compact message.created", () => {
    const event = normalizeDurableEvent({
      id: "e1",
      type: "message.created",
      payload: {
        conversationId: "c1",
        eventSeq: 5,
        messageId: "m1",
        createdSeq: 5,
        senderId: "u1",
        clientMessageId: "cm1",
      },
    });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("message.created");
    expect(event!.eventSeq).toBe(5);
    expect(event!.compact).toBe(true);
  });

  it("does not default deleted to message.created", () => {
    const event = normalizeDurableEvent({
      id: "e2",
      type: "message.deleted",
      payload: {
        conversationId: "c1",
        eventSeq: 6,
        messageId: "m1",
        createdSeq: 5,
      },
    });
    expect(event!.type).toBe("message.deleted");
  });

  it("ignores access.revoked (no eventSeq)", () => {
    expect(
      normalizeDurableEvent({
        type: "access.revoked",
        payload: { conversationId: "c1" },
      }),
    ).toBeNull();
  });
});
