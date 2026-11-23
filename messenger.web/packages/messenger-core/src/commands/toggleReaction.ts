import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export interface ToggleReactionInput {
  conversationId: string;
  localId: string;
  emoji: string;
  userId: string;
}

export async function toggleReaction(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: ToggleReactionInput,
): Promise<void> {
  const row = await db.messages.get(input.localId);
  if (!row || row.accountKey !== accountKey) {
    throw new Error("Message not found");
  }
  if (!row.serverId) {
    throw new Error("Message not acknowledged yet");
  }

  const messageId = row.serverId;
  const now = Date.now();
  const reactions = { ...(row.reactions ?? {}) };
  const users = new Set(reactions[input.emoji] ?? []);
  const removing = users.has(input.userId);
  if (removing) {
    users.delete(input.userId);
  } else {
    users.add(input.userId);
  }
  if (users.size === 0) {
    delete reactions[input.emoji];
  } else {
    reactions[input.emoji] = [...users];
  }

  await db.transaction("rw", db.messages, db.outbox, async () => {
    await db.messages.put({ ...row, reactions });
    await db.outbox.put({
      id: crypto.randomUUID(),
      accountKey,
      type: removing ? "reaction.remove" : "reaction.add",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: removing
        ? {
            type: "reaction.remove",
            payload: { conversationId: input.conversationId, messageId, emoji: input.emoji },
          }
        : {
            type: "reaction.add",
            payload: { conversationId: input.conversationId, messageId, emoji: input.emoji },
          },
    });
  });
}
