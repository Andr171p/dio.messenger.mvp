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
  const lastSent = useRef<number | null>(null);

  useEffect(() => {
    lastSent.current = null;
  }, [conversationId]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !conversationId || !messages?.length || !db || !http || !accountKey) {
      return;
    }

    const markVisible = () => {
      if (document.visibilityState !== "visible") return;
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
      if (maxSeq <= 0 || lastSent.current === maxSeq) return;
      lastSent.current = maxSeq;
      void markConversationRead(db, http, accountKey, conversationId, maxSeq).catch(
        () => {
          lastSent.current = null;
        },
      );
    };

    const onScroll = () => markVisible();
    root.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", markVisible);
    markVisible();

    return () => {
      root.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", markVisible);
    };
  }, [conversationId, messages, scrollerRef, db, http, accountKey]);
}
