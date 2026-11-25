import { HttpError } from "@dio/messenger-core";
import { Avatar, Button } from "@dio/messenger-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "../app/providers/AuthProvider.js";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import {
  fromDesk,
  openDirect,
  photoUrl,
  useProfiles,
  userLabel,
  type DeskUser,
  type Profile,
} from "../features/conversation/profiles.js";
import { ChatDialog } from "./ChatDialog.js";
import styles from "./NewChatModal.module.css";

export function ProfileDialog({
  initial,
  onClose,
  onOpenChat = onClose,
}: {
  initial: Profile;
  onClose: () => void;
  onOpenChat?: () => void;
}) {
  const { session } = useAuth();
  const { http, desk, db, accountKey } = useRuntime();
  const queries = useQueryClient();
  const profile = useProfiles([initial.id]).get(initial.id) ?? initial;
  const own = initial.id === session?.userId;
  const ownProfile = useQuery({
    queryKey: ["desk-own-profile", accountKey],
    enabled: own && !!desk,
    queryFn: async () => fromDesk(await desk!.get<DeskUser>("/api/v1/users/me")),
  });
  const displayed = ownProfile.data ?? profile;
  const company = useQuery({
    queryKey: ["desk-company", accountKey, displayed.counterpartyId],
    enabled: own && !!desk && !!displayed.counterpartyId,
    queryFn: () =>
      desk!.get<{ name: string }>(
        `/api/v1/counterparties/${encodeURIComponent(displayed.counterpartyId!)}`,
      ),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const name = userLabel(displayed);

  function updatePhoto(updated: Profile) {
    queries.setQueryData(["desk-profile", accountKey, initial.id], updated);
    queries.setQueryData(["desk-own-profile", accountKey], updated);
    void queries.invalidateQueries({ queryKey: ["directory"] });
    void queries.invalidateQueries({ queryKey: ["directory-profiles"] });
  }

  async function removePhoto() {
    if (!desk || busy) return;
    setBusy(true);
    setError("");
    try {
      updatePhoto(
        fromDesk(
          await desk.request<DeskUser>("/api/v1/users/me/avatar", { method: "DELETE" }),
        ),
      );
    } catch {
      setError("Не удалось удалить фото. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file || !desk) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Выберите фото размером до 5 МБ.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = fromDesk(
        await desk.request<DeskUser>("/api/v1/users/me/avatar", {
          method: "POST",
          body: form,
        }),
      );
      updatePhoto(updated);
    } catch (error) {
      if (error instanceof HttpError && error.status === 413) {
        setError("Выберите фото размером до 5 МБ.");
      } else if (error instanceof HttpError && error.status === 422) {
        setError(
          "Не удалось прочитать фото. Выберите JPEG, PNG или WebP до 20 мегапикселей.",
        );
      } else {
        setError("Фото не сохранено. Проверьте подключение и попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  }
  async function message() {
    if (!http || !db || !accountKey) return;
    setBusy(true);
    setError("");
    try {
      await openDirect(http, db, accountKey, profile);
      onOpenChat();
    } catch {
      setError("Не удалось открыть переписку. Проверьте подключение.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ChatDialog title={own ? "Мой профиль" : "Профиль"} onClose={onClose} busy={busy}>
      <div className={styles.hero}>
        <Avatar name={name} src={photoUrl(displayed.avatarUrl)} size="lg" />
        <h3>{name}</h3>
        {displayed.username && <span>@{displayed.username}</span>}
        {displayed.email && displayed.email !== name && <span>{displayed.email}</span>}
        {own && displayed.counterpartyId && (
          <span>
            Контрагент ·{" "}
            {company.data?.name ?? (company.isPending ? "Загружаем…" : "Недоступен")}
          </span>
        )}
      </div>
      {own ? (
        <>
          <input
            hidden
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            disabled={busy}
            loading={busy}
            onClick={() => fileInput.current?.click()}
          >
            Изменить фото
          </Button>
          {displayed.avatarUrl && (
            <Button variant="ghost" disabled={busy} onClick={() => void removePhoto()}>
              Удалить фото
            </Button>
          )}
        </>
      ) : (
        <Button disabled={busy || !http} loading={busy} onClick={() => void message()}>
          Написать сообщение
        </Button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </ChatDialog>
  );
}
