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
  showSearch?: boolean;
  onPick: (token: string, id: string) => void;
  onClose: () => void;
}

function userLabel(user: DirectoryUser): string {
  return user.fullName?.trim() || user.username?.trim() || user.email;
}

function mentionToken(user: DirectoryUser): string {
  const handle =
    user.username?.trim() || user.email.split("@")[0] || user.id.slice(0, 8);
  return `@${handle}`;
}

function extractMentionQuery(text: string): string {
  const match = /@([\p{L}\p{N}_.-]*)$/u.exec(text);
  return match ? match[1]! : "";
}

function extractTicketQuery(text: string): string {
  const match = /#([\p{L}\p{N}_-]*)$/u.exec(text);
  return match ? match[1]! : "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function MentionTicketPicker({
  mode,
  conversationId,
  http,
  query,
  showSearch = false,
  onPick,
  onClose,
}: MentionTicketPickerProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const mentionQ = showSearch ? search.trim() : extractMentionQuery(query);
  const ticketQ = showSearch ? search.trim() : extractTicketQuery(query);
  const [ticketTerm, setTicketTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTicketTerm(ticketQ), 250);
    return () => clearTimeout(timer);
  }, [ticketQ]);

  const ticketSearch = useQuery({
    queryKey: ["picker-tickets", conversationId, ticketTerm],
    enabled:
      mode === "ticket" &&
      !!http &&
      (ticketTerm.length === 0 || ticketTerm.length >= 3) &&
      !UUID_RE.test(ticketTerm),
    queryFn: () => {
      const params = new URLSearchParams({ conversationId, q: ticketTerm });
      return http!.get<ResourcePreview[]>(`/v1/resources/tickets/search?${params}`);
    },
    retry: false,
  });

  const directory = useQuery({
    queryKey: ["picker-directory", mentionQ],
    enabled: mode === "mention" && !!http,
    queryFn: async () => {
      const q = encodeURIComponent(mentionQ);
      return http!.get<DirectoryUser[]>(`/v1/directory/users?q=${q}`);
    },
  });

  const members = useQuery({
    queryKey: ["picker-members", conversationId],
    enabled: mode === "mention" && !!http,
    queryFn: () =>
      http!.get<{ principalId: string }[]>(
        `/v1/conversations/${conversationId}/members`,
      ),
  });

  const ticketPreview = useQuery({
    queryKey: ["picker-ticket-preview", conversationId, ticketQ],
    enabled:
      mode === "ticket" && !!http && ticketQ.length >= 2 && UUID_RE.test(ticketQ),
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
    if (ticketQ === ticketTerm) {
      for (const ticket of ticketSearch.data ?? []) {
        if (
          ticket.number &&
          ticket.ref?.resourceId &&
          UUID_RE.test(ticket.ref.resourceId)
        ) {
          items.push({
            id: ticket.ref.resourceId,
            label: `#${ticket.number}`,
            sub: ticket.title,
          });
        }
      }
    }

    if (
      ticketPreview.data?.number &&
      UUID_RE.test(ticketPreview.data.ref?.resourceId ?? ticketQ)
    ) {
      const id = ticketPreview.data.ref?.resourceId ?? ticketQ;
      const num = ticketPreview.data.number ?? `#${ticketQ}`;
      items.push({
        id,
        label: num.startsWith("#") ? num : `#${num}`,
        sub: ticketPreview.data.title,
      });
    }

    const link = contextLink.data;
    if (link?.resourceId && UUID_RE.test(link.resourceId)) {
      const label = link.number ?? link.resourceId ?? "";
      if (
        (!needle || label.toLowerCase().includes(needle)) &&
        !items.some((row) => row.id === link.resourceId)
      ) {
        items.push({
          id: link.resourceId,
          label: label.startsWith("#") ? label : `#${label}`,
          sub: "Контекст беседы",
        });
      }
    }

    return items;
  }, [
    mode,
    ticketQ,
    ticketTerm,
    ticketSearch.data,
    ticketPreview.data,
    contextLink.data,
  ]);

  const mentionItems = useMemo(() => {
    if (mode !== "mention") return [];
    const active = new Set(members.data?.map((member) => member.principalId));
    return (directory.data ?? [])
      .filter((user) => active.has(user.id))
      .map((user) => ({
        id: user.id,
        label: userLabel(user),
        sub: user.email,
        token: mentionToken(user),
      }));
  }, [mode, directory.data, members.data]);

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
      if (
        e.isComposing ||
        (!(e.target instanceof HTMLTextAreaElement) && e.target !== searchRef.current)
      )
        return;
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
        if (row) onPick(row.token, row.id);
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
    (mode === "mention" && (directory.isFetching || members.isFetching)) ||
    (mode === "ticket" &&
      (ticketPreview.isFetching || contextLink.isFetching || ticketSearch.isFetching));

  return (
    <div className={styles.root}>
      {showSearch ? (
        <input
          ref={searchRef}
          className={styles.search}
          value={search}
          maxLength={100}
          aria-label={mode === "mention" ? "Поиск участника" : "Поиск заявки"}
          placeholder={
            mode === "mention" ? "Поиск участника" : "Номер или название заявки"
          }
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
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
          {mode === "mention"
            ? "Участники не найдены"
            : ticketSearch.isError
              ? "Поиск заявок недоступен"
              : ticketQ.length < 3
                ? "Введите название заявки или её UUID"
                : "Заявки не найдены"}
        </p>
      ) : (
        <ul
          className={styles.list}
          ref={listRef}
          role="listbox"
          aria-label={mode === "mention" ? "Упоминания" : "Заявки"}
        >
          {rows.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? "true" : undefined}
                className={[styles.row, index === activeIndex ? styles.rowActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(row.token, row.id)}
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
