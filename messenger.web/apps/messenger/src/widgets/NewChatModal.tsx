import { Button, Input, Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./NewChatModal.module.css";

interface DirectoryUser {
  id: string;
  fullName?: string | null;
  email: string;
  username?: string | null;
}

function userLabel(user: DirectoryUser): string {
  return user.fullName?.trim() || user.username?.trim() || user.email;
}

interface ConversationDto {
  id: string;
  title?: string | null;
  type?: string;
  hasExternalMembers?: boolean;
}

export function NewChatModal() {
  const open = useUiStore((s) => s.newChatOpen);
  const setOpen = useUiStore((s) => s.setNewChatOpen);
  const setSelected = useUiStore((s) => s.setSelectedConversation);
  const { http, db, accountKey } = useRuntime();
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    if (!root) return;
    const selector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = root.querySelectorAll<HTMLElement>(selector);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const directory = useQuery({
    queryKey: ["directory", query],
    enabled: !!http && open && query.trim().length >= 1,
    queryFn: async () => {
      const q = encodeURIComponent(query.trim());
      return http!.get<DirectoryUser[]>(`/v1/directory/users?q=${q}`);
    },
  });

  if (!open) return null;

  const upsertConversation = async (dto: ConversationDto) => {
    if (!db || !accountKey) return;
    await db.conversations.put({
      accountKey,
      id: dto.id,
      title: dto.title?.trim() || dto.id,
      unreadCount: 0,
      isGuest: dto.hasExternalMembers ?? false,
      hasExternalMembers: dto.hasExternalMembers,
      kind: dto.type?.toUpperCase() === "GROUP" ? "group" : "direct",
      isPinned: false,
      updatedAt: Date.now(),
    });
    setSelected(dto.id);
    setOpen(false);
  };

  const createDirect = async (peerId: string) => {
    if (!http) return;
    setPending(true);
    setError(null);
    try {
      const dto = await http.post<ConversationDto>("/v1/conversations/direct", {
        peerId,
      });
      await upsertConversation(dto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать чат");
    } finally {
      setPending(false);
    }
  };

  const createGroup = async () => {
    if (!http || !groupTitle.trim()) return;
    setPending(true);
    setError(null);
    try {
      const dto = await http.post<ConversationDto>("/v1/conversations", {
        title: groupTitle.trim(),
        memberIds: selectedIds,
      });
      await upsertConversation(dto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать группу");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-chat-title">Новый чат</h2>
        <div className={styles.tabs}>
          <button
            type="button"
            className={mode === "direct" ? styles.tabActive : styles.tab}
            onClick={() => setMode("direct")}
          >
            Личный
          </button>
          <button
            type="button"
            className={mode === "group" ? styles.tabActive : styles.tab}
            onClick={() => setMode("group")}
          >
            Группа
          </button>
        </div>
        {mode === "direct" ? (
          <>
            <Input
              placeholder="Найти пользователя"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Поиск пользователя"
            />
            {directory.isFetching ? <Spinner size="sm" /> : null}
            <ul className={styles.users}>
              {(directory.data ?? []).map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className={styles.userRow}
                    disabled={pending}
                    onClick={() => void createDirect(user.id)}
                  >
                    <span>{userLabel(user)}</span>
                    <span className={styles.email}>{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <Input
              label="Название группы"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
            />
            <Input
              placeholder="Добавить участников"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className={styles.users}>
              {(directory.data ?? []).map((user) => {
                const checked = selectedIds.includes(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      className={styles.userRow}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== user.id)
                            : [...prev, user.id],
                        )
                      }
                    >
                      <input type="checkbox" readOnly checked={checked} />
                      <span>{userLabel(user)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              onClick={() => void createGroup()}
              disabled={pending || !groupTitle.trim()}
              loading={pending}
            >
              Создать группу
            </Button>
          </>
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}