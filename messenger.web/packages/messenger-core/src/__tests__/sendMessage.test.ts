import { describe, expect, it } from "vitest";
import { sendMessage } from "../commands/sendMessage.js";
import { openMessengerDatabase } from "../storage/database.js";

describe("sendMessage", () => {
  it("creates message and outbox atomically", async () => {
    const accountKey = "user-1";
    const db = openMessengerDatabase(accountKey);
    await db.conversations.put({
      accountKey,
      id: "conv-1",
      title: "Support",
      unreadCount: 0,
      isGuest: false,
      isPinned: false,
      updatedAt: Date.now(),
    });

    const clientMessageId = await sendMessage(db, accountKey, {
      conversationId: "conv-1",
      content: "Hello",
      authorId: accountKey,
    });

    const message = await db.messages.get(clientMessageId);
    const outbox = await db.outbox.toArray();

    expect(message).toMatchObject({
      localId: clientMessageId,
      clientMessageId,
      sendStatus: "queued",
      content: "Hello",
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.command.type).toBe("message.send");
  });
});