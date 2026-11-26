import { markConversationRead, type LocalMessage } from "@dio/messenger-core";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";

export function useReadCursor(
  conversationId: string | null,
  messages: LocalMessage[] | undefined,
  scrollerRef: RefObject<HTMLElement | null>,
) {
  const { db, http, accountKey } = useRuntime();
  const cursor = useRef({ confirmed: 0, pending: 0, sending: false });

  useEffect(() => {
    cursor.current = { confirmed: 0, pending: 0, sending: false };
  }, [accountKey, conversationId]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !conversationId || !messages?.length || !db || !http || !accountKey) {
      return;
    }

    const state = cursor.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = async () => {
      timer = undefined;
      if (state.sending || state.pending <= state.confirmed) return;
      const position = state.pending;
      state.sending = true;
      try {
        await markConversationRead(db, http, accountKey, conversationId, position);
        state.confirmed = position;
      } catch {
        return;
      } finally {
        state.sending = false;
      }
      if (state.pending > state.confirmed) void flush();
    };
    const markVisible = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      if (!root.getClientRects().length || root.closest("[inert]")) return;
      const rootRect = root.getBoundingClientRect();
      let maxSeq = 0;
      root.querySelectorAll("[data-read-seq]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        const visible =
          rect.bottom > rootRect.top + 8 && rect.top < rootRect.bottom - 8;
        if (!visible) return;
        const seq = Number(el.getAttribute("data-read-seq") ?? 0);
        if (seq > maxSeq) maxSeq = seq;
      });
      state.pending = Math.max(state.pending, maxSeq);
      if (state.pending > state.confirmed && !timer)
        timer = setTimeout(() => void flush(), 600);
    };

    const onScroll = () => markVisible();
    root.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", markVisible);
    window.addEventListener("focus", markVisible);
    window.addEventListener("online", markVisible);
    markVisible();

    return () => {
      root.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", markVisible);
      window.removeEventListener("focus", markVisible);
      window.removeEventListener("online", markVisible);
      clearTimeout(timer);
      void flush();
    };
  }, [conversationId, messages, scrollerRef, db, http, accountKey]);
}
