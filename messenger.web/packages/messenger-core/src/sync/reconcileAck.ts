import type { AccountKey, SendMessageAck } from "../models/types.js";
import type { MessengerDatabase } from "../storage/database.js";

export async function reconcileSendAck(
  db: MessengerDatabase,
  accountKey: AccountKey,
  ack: SendMessageAck,
  outboxId?: string,
): Promise<void> {
  await db.transaction("rw", db.messages, db.outbox, async () => {
    const local = await db.messages
      .where("[accountKey+clientMessageId]")
      .equals([accountKey, ack.clientMessageId])
      .first();

    if (local && local.clientMessageId !== ack.clientMessageId) {
      throw new Error("ACK clientMessageId mismatch");
    }

    if (local) {
      await db.messages.put({
        ...local,
        serverId: ack.messageId,
        createdSeq: ack.createdSeq,
        sendStatus: "sent",
      });
    }

    if (outboxId) {
      await db.outbox.delete(outboxId);
      return;
    }

    const pending = await db.outbox
      .where("accountKey")
      .equals(accountKey)
      .filter(
        (item) =>
          item.type === "message.send" &&
          item.command.type === "message.send" &&
          item.command.payload.clientMessageId === ack.clientMessageId,
      )
      .first();

    if (pending) {
      await db.outbox.delete(pending.id);
    }
  });
}