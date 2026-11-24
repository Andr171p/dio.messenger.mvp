import type { AccountKey } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";
import {
  blocksToPlainPreview,
  parseComposerContent,
  readMessageBlocks,
} from "../content/blocks.js";

export interface EditMessageInput {
  conversationId: string;
  localId: string;
  content: string;
}

export async function editMessage(
  db: MessengerDatabase,
  accountKey: AccountKey,
  input: EditMessageInput,
): Promise<void> {
  await db.transaction("rw", db.messages, db.outbox, async () => {
    const row = await db.messages.get(input.localId);
    if (
      !row?.serverId ||
      row.accountKey !== accountKey ||
      row.conversationId !== input.conversationId ||
      row.deletedAt
    ) {
      throw new Error("Message not found");
    }
    const messageId = row.serverId;
    const now = Date.now();
    const nextRevision = row.revision + 1;
    const blocks = [
      ...parseComposerContent(input.content),
      ...readMessageBlocks(row).filter(
        (block) => block.type === "resource" || block.type === "media",
      ),
    ];
    const blocksJson = JSON.stringify(blocks);
    await db.messages.put({
      ...row,
      content: blocksToPlainPreview(blocks),
      contentBlocks: blocksJson,
      revision: nextRevision,
    });
    await db.outbox.put({
      id: crypto.randomUUID(),
      accountKey,
      type: "message.edit",
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      command: {
        type: "message.edit",
        payload: {
          conversationId: input.conversationId,
          messageId,
          content: input.content,
          blocksJson,
          expectedRevision: nextRevision,
        },
      },
    });
  });
}
