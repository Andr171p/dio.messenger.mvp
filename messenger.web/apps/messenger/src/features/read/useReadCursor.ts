import { markConversationRead, type LocalMessage } from "@dio/messenger-core";
import { useEffect, useRef } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export function useReadCursor(
  conversationId: string | null,
  messages: LocalMessage[] | undefined,
) {
  const { db, http, accountKey } = useRuntime();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || !db || !http || !accountKey || !messages?.length) {
      return;
    }
    const latest = messages.reduce((best, row) => {
      const seq = row.createdSeq ?? row.createdAt;
      const bestSeq = best.createdSeq ?? best.createdAt;
      return seq > bestSeq ? row : best;
    });
    const seq = latest.createdSeq;
    if (seq === undefined) return;
    const key = `${conversationId}:${seq}`;
    if (lastSent.current === key) return;
    lastSent.current = key;
    void markConversationRead(db, http, accountKey, conversationId, seq).catch(
      () => {
        lastSent.current = null;
      },
    );
  }, [conversationId, db, http, accountKey, messages]);
}