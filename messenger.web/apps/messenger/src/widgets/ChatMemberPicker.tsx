import { Avatar, Input } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import {
  photoUrl,
  userLabel,
  type Profile,
} from "../features/conversation/profiles.js";
import { ChatDialog } from "./ChatDialog.js";
import styles from "./NewChatModal.module.css";

export function ChatMemberPicker({
  conversationId,
  members,
  onClose,
  onAdded,
}: {
  conversationId: string;
  members: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { http, desk, accountKey } = useRuntime();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = query.trim();
  const users = useQuery({
    queryKey: ["add-chat-members", accountKey, search],
    enabled: !!desk && !!search,
    queryFn: async () => {
      const params = new URLSearchParams({ q: search, size: "40" });
      const result = await desk!.get<{
        items: {
          id: string;
          full_name?: string;
          email?: string;
          username?: string;
          avatar_url?: string;
          is_active?: boolean;
          roles: string[];
        }[];
      }>(`/api/v1/users?${params}`);
      return result.items.filter((user) => user.is_active !== false);
    },
  });
  const available = (users.data ?? []).filter((user) => !members.includes(user.id));
  return (
    <ChatDialog title="Добавить участника" onClose={onClose} busy={busy}>
      <Input
        label="Имя, логин или почта"
        value={query}
        maxLength={255}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      {search && users.isFetching && <p role="status">Ищем пользователей…</p>}
      {search && users.isError && <p role="status">Каталог недоступен.</p>}
      {search && users.isSuccess && available.length === 0 && (
        <p>Подходящих пользователей нет.</p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.users}>
        {available.map((user) => {
          const profile: Profile = {
            id: user.id,
            fullName: user.full_name,
            username: user.username,
            email: user.email,
          };
          return (
            <li key={user.id}>
              <button
                type="button"
                className={styles.userRow}
                disabled={busy}
                onClick={async () => {
                  if (!http || busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    const roles = user.roles ?? [];
                    const guest =
                      roles.length > 0 &&
                      roles.every(
                        (role) => role === "customer" || role === "customer_admin",
                      );
                    await http.post(`/v1/conversations/${conversationId}/members`, {
                      principalId: user.id,
                      role: guest ? "guest" : "member",
                    });
                    onAdded();
                    onClose();
                  } catch {
                    setError(
                      "Не удалось добавить участника. Проверьте настройки группы и подключение.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Avatar
                  name={userLabel(profile)}
                  src={photoUrl(user.avatar_url)}
                  size="sm"
                />
                {userLabel(profile)}
              </button>
            </li>
          );
        })}
      </ul>
    </ChatDialog>
  );
}
