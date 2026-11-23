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

  const messageId = row.serverId ?? row.localId;
  const now = Date.now();
  const reactions = { ...(row.reactions ?? {}) };
  const users = new Set(reactions[input.emoji] ?? []);
  if (users.has(input.userId)) {
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
      type: "reaction.toggle",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: {
        type: "reaction.toggle",
        payload: {
          conversationId: input.conversationId,
          messageId,
          emoji: input.emoji,
        },
      },
    });
  });
}