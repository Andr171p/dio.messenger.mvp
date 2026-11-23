import type { HttpClient } from "@dio/messenger-core";
import { DIODESK_PROVIDER } from "@dio/messenger-core";
import { Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./MentionTicketPicker.module.css";

export type MentionTicketPickerMode = "mention" | "ticket";

interface DirectoryUser {
  id: string;
  fullName?: string | null;
  email: string;
  username?: string | null;
}

interface ResourcePreview {
  number?: string;
  title?: string;
  ref?: { resourceId?: string };
}

interface MentionTicketPickerProps {
  mode: MentionTicketPickerMode;
  conversationId: string;
  http: HttpClient | null;
  query: string;
  onPick: (token: string) => void;
  onClose: () => void;
}

function userLabel(user: DirectoryUser): string {
  return user.fullName?.trim() || user.username?.trim() || user.email;
}

function mentionToken(user: DirectoryUser): string {
  const handle = user.username?.trim() || user.email.split("@")[0] || user.id.slice(0, 8);
  return `@${handle}`;
}

function extractMentionQuery(text: string): string {
  const match = /@([\w.-]*)$/.exec(text);
  return match ? match[1]! : "";
}

function extractTicketQuery(text: string): string {
  const match = /#([\w-]*)$/.exec(text);
  return match ? match[1]! : "";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function MentionTicketPicker({
  mode,
  conversationId,
  http,
  query,
  onPick,
  onClose,
}: MentionTicketPickerProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const mentionQ = extractMentionQuery(query);
  const ticketQ = extractTicketQuery(query);

  const directory = useQuery({
    queryKey: ["picker-directory", mentionQ],
    enabled: mode === "mention" && !!http && mentionQ.length >= 0,
    queryFn: async () => {
      const q = encodeURIComponent(mentionQ);
      return http!.get<DirectoryUser[]>(`/v1/directory/users?q=${q}`);
    },
  });

  const ticketPreview = useQuery({
    queryKey: ["picker-ticket-preview", conversationId, ticketQ],
    enabled:
      mode === "ticket" &&
      !!http &&
      ticketQ.length >= 2 &&
      (UUID_RE.test(ticketQ) || /^inc/i.test(ticketQ) || /^req/i.test(ticketQ)),
    queryFn: async () => {
      const params = new URLSearchParams({
        provider: DIODESK_PROVIDER,
        resourceType: "ticket",
        resourceId: ticketQ,
        conversationId,
      });
      try {
        return await http!.get<ResourcePreview>(`/v1/resources/preview?${params}`);
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const contextLink = useQuery({
    queryKey: ["picker-context-link", conversationId],
    enabled: mode === "ticket" && !!http,
    queryFn: async () => {
      try {
        return await http!.get<{ resourceId?: string; number?: string }>(
          `/v1/conversations/${conversationId}/context-link`,
        );
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const ticketItems = useMemo(() => {
    if (mode !== "ticket") return [] as { id: string; label: string; sub?: string }[];

    const items: { id: string; label: string; sub?: string }[] = [];
    const needle = ticketQ.toLowerCase();

    if (ticketPreview.data?.number || ticketPreview.data?.title) {
      const id = ticketPreview.data.ref?.resourceId ?? ticketQ;
      const num = ticketPreview.data.number ?? `#${ticketQ}`;
      items.push({
        id: `preview-${id}`,
        label: num.startsWith("#") ? num : `#${num}`,
        sub: ticketPreview.data.title,
      });
    }

    const link = contextLink.data;
    if (link?.number || link?.resourceId) {
      const label = link.number ?? link.resourceId ?? "";
      if (!needle || label.toLowerCase().includes(needle)) {
        items.push({
          id: `link-${link.resourceId ?? label}`,
          label: label.startsWith("#") ? label : `#${label}`,
          sub: "Контекст беседы",
        });
      }
    }

    const stem = ticketQ.replace(/^(inc|req)-?/i, "").trim();
    const placeholders = [
      stem ? `#INC-${stem.toUpperCase()}` : "#INC-…",
      stem ? `#REQ-${stem.toUpperCase()}` : "#REQ-…",
    ];
    for (const label of placeholders) {
      if (needle && !label.toLowerCase().includes(needle)) continue;
      if (!items.some((row) => row.label.toLowerCase() === label.toLowerCase())) {
        items.push({ id: label, label, sub: "Вставить ссылку" });
      }
    }

    return items;
  }, [mode, ticketQ, ticketPreview.data, contextLink.data]);

  const mentionItems = useMemo(() => {
    if (mode !== "mention") return [];
    return (directory.data ?? []).map((user) => ({
      id: user.id,
      label: userLabel(user),
      sub: user.email,
      token: mentionToken(user),
    }));
  }, [mode, directory.data]);

  const rows =
    mode === "mention"
      ? mentionItems.map((m) => ({
          id: m.id,
          label: m.label,
          sub: m.sub,
          token: m.token,
        }))
      : ticketItems.map((t) => ({
          id: t.id,
          label: t.label,
          sub: t.sub,
          token: t.label.startsWith("#") ? t.label : `#${t.label}`,
        }));

  useEffect(() => {
    setActiveIndex(0);
  }, [mode, mentionQ, ticketQ, rows.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!rows.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = rows[activeIndex];
        if (row) onPick(row.token);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, activeIndex, onPick, onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector(`[data-active="true"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const loading =
    (mode === "mention" && directory.isFetching) ||
    (mode === "ticket" && (ticketPreview.isFetching || contextLink.isFetching));

  return (
    <div className={styles.root} role="listbox" aria-label={mode === "mention" ? "Упоминания" : "Заявки"}>
      {loading ? (
        <>
          <p className={styles.hint}>
            {mode === "mention" ? "Поиск сотрудников…" : "Поиск заявок ITSM…"}
          </p>
          <Spinner size="sm" />
        </>
      ) : null}
      {!rows.length && !loading ? (
        <p className={styles.empty}>
          {mode === "mention" ? "Пользователи не найдены" : "Введите номер заявки"}
        </p>
      ) : (
        <ul className={styles.list} ref={listRef}>
          {rows.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? "true" : undefined}
                className={[
                  styles.row,
                  index === activeIndex ? styles.rowActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(row.token)}
              >
                <span className={styles.label}>{row.label}</span>
                {row.sub ? <span className={styles.sub}>{row.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}