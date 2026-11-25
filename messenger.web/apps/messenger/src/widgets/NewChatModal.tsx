import { HttpError } from "@dio/messenger-core";
import { Avatar, Button, Input } from "@dio/messenger-ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import {
  openChat,
  photoUrl,
  userLabel,
  type Profile,
  type ChatDto,
} from "../features/conversation/profiles.js";
import { useUiStore } from "../stores/uiStore.js";
import { ChatDialog } from "./ChatDialog.js";
import { ProfileDialog } from "./ProfileDialog.js";
import { groupPhoto } from "./groupPhoto.js";
import styles from "./NewChatModal.module.css";

export function NewChatModal() {
  return useUiStore((s) => s.newChatOpen) ? <NewChatForm /> : null;
}

function NewChatForm() {
  const close = () => useUiStore.getState().setNewChatOpen(false);
  const { session } = useAuth();
  const { db, accountKey, http } = useRuntime();
  const [step, setStep] = useState<"direct" | "details" | "members">("direct");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const directory = useInfiniteQuery({
    queryKey: ["directory", accountKey, query.trim()],
    enabled: !!http && step !== "details",
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      http!.get<Profile[]>(
        `/v1/directory/users?size=30&page=${pageParam}&q=${encodeURIComponent(query.trim())}`,
      ),
    getNextPageParam: (last, pages) =>
      last.length === 30 ? pages.length + 1 : undefined,
  });
  const users =
    directory.data?.pages.flat().filter((user) => user.id !== session?.userId) ?? [];
  function next() {
    if (!title.trim()) {
      setInvalid(true);
      document.getElementById("group-name")?.focus();
      return;
    }
    setStep("members");
    setQuery("");
    setError("");
  }
  async function create() {
    if (!http || !db || !accountKey || busy) return;
    setBusy(true);
    setError("");
    try {
      const dto = await http.post<ChatDto>("/v1/conversations", {
        title: title.trim(),
        description: description.trim() || undefined,
        avatarUrl: avatar,
        memberIds: selected
          .filter((u) => u.principalKind !== "customer")
          .map((u) => u.id),
        guestIds: selected
          .filter((u) => u.principalKind === "customer")
          .map((u) => u.id),
      });
      await openChat(db, accountKey, dto);
      close();
    } catch (error) {
      setError(
        error instanceof HttpError && error.status === 403
          ? "У вашей учётной записи нет прав на создание групп."
          : "Не удалось создать группу. Проверьте подключение. Введённые данные сохранены в форме.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ChatDialog
        title={step === "members" ? "Добавить участников" : "Новый чат"}
        onClose={close}
        busy={busy}
      >
        {step !== "members" && (
          <div className={styles.tabs}>
            {(["direct", "details"] as const).map((mode) => (
              <button
                key={mode}
                disabled={busy}
                aria-pressed={step === mode}
                className={step === mode ? styles.tabActive : styles.tab}
                onClick={() => {
                  setStep(mode);
                  setError("");
                  setQuery("");
                }}
              >
                {mode === "direct" ? "Личный" : "Группа"}
              </button>
            ))}
          </div>
        )}
        {step === "details" ? (
          <form
            noValidate
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <div className={styles.photoRow}>
              <button
                type="button"
                disabled={busy}
                className={styles.photoButton}
                aria-label="Выбрать фото группы"
                onClick={() => fileInput.current?.click()}
              >
                <Avatar name={title || "+"} src={avatar} size="lg" />
              </button>
              <button
                className={styles.textButton}
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                Фото группы
              </button>
            </div>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  setAvatar(await groupPhoto(file));
                } catch {
                  setError("Выберите фото JPEG, PNG или WebP размером до 5 МБ.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Input
              id="group-name"
              label="Название группы"
              maxLength={255}
              required
              value={title}
              aria-invalid={invalid}
              onChange={(e) => {
                setTitle(e.target.value);
                setInvalid(false);
              }}
            />
            <Input
              label="Описание (по желанию)"
              maxLength={1024}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              Далее
            </Button>
          </form>
        ) : (
          <>
            <Input
              aria-label="Поиск пользователя"
              placeholder="Имя, логин или почта"
              value={query}
              maxLength={255}
              onChange={(e) => setQuery(e.target.value)}
            />
            {step === "members" && selected.length > 0 && (
              <div className={styles.chips}>
                {selected.map((user) => (
                  <button
                    key={user.id}
                    aria-label={`Убрать ${userLabel(user)}`}
                    onClick={() =>
                      setSelected((prev) => prev.filter((u) => u.id !== user.id))
                    }
                  >
                    {userLabel(user)} ×
                  </button>
                ))}
              </div>
            )}
            {directory.isPending ? (
              <p role="status">Загружаем контакты…</p>
            ) : directory.isError ? (
              <p role="status">Не удалось загрузить контакты. Проверьте подключение.</p>
            ) : (
              !users.length && (
                <p role="status">
                  {query
                    ? "По этому запросу никого не нашли."
                    : "Доступных контактов пока нет."}
                </p>
              )
            )}
            <ul className={styles.users}>
              {users.map((user) => {
                const checked = selected.some((u) => u.id === user.id);
                return (
                  <li key={user.id}>
                    <button
                      className={styles.userRow}
                      disabled={busy}
                      type="button"
                      aria-pressed={step === "members" ? checked : undefined}
                      onClick={() => {
                        if (step === "direct") setProfile(user);
                        else
                          setSelected((prev) =>
                            checked
                              ? prev.filter((u) => u.id !== user.id)
                              : [...prev, user],
                          );
                      }}
                    >
                      <Avatar
                        name={userLabel(user)}
                        src={photoUrl(user.avatarUrl)}
                        size="sm"
                      />
                      <span className={styles.userCopy}>
                        <strong>{userLabel(user)}</strong>
                        <small>
                          {user.username ? "@" + user.username : user.email}
                        </small>
                      </span>
                      {step === "members" && (
                        <span aria-hidden>{checked ? "☑" : "☐"}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {directory.hasNextPage && (
              <Button
                variant="ghost"
                disabled={directory.isFetchingNextPage}
                onClick={() => void directory.fetchNextPage()}
              >
                Ещё контакты
              </Button>
            )}
            {step === "members" && (
              <div className={styles.footer}>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setStep("details")}
                >
                  Назад
                </Button>
                <Button disabled={busy} loading={busy} onClick={() => void create()}>
                  Создать группу
                </Button>
              </div>
            )}
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </ChatDialog>
      {profile && (
        <ProfileDialog
          initial={profile}
          onClose={() => setProfile(undefined)}
          onOpenChat={close}
        />
      )}
    </>
  );
}
