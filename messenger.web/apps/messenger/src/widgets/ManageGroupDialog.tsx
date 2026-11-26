import { Avatar, Button, Input } from "@dio/messenger-ui";
import { useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { photoUrl } from "../features/conversation/profiles.js";
import { ChatDialog } from "./ChatDialog.js";
import { TopicEditorDialog } from "./GroupTopics.js";
import { groupPhoto } from "./groupPhoto.js";
import styles from "./NewChatModal.module.css";

export function ManageGroupDialog({
  id,
  title,
  description,
  avatarUrl,
  eligible,
  onClose,
  onTransfer,
  onTopicCreated,
}: {
  id: string;
  title: string;
  description?: string;
  avatarUrl?: string;
  eligible?: { id: string; label: string }[];
  onClose: () => void;
  onTransfer: () => void;
  onTopicCreated: () => void;
}) {
  const { http, db } = useRuntime();
  const [name, setName] = useState(title);
  const [about, setAbout] = useState(description ?? "");
  const [photo, setPhoto] = useState(avatarUrl ?? null);
  const [nextOwner, setNextOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function save() {
    if (!http || !db || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    const values = {
      title: name.trim(),
      description: about.trim() || null,
      avatarUrl: photo,
    };
    try {
      await http.put(`/v1/conversations/${id}/settings`, values);
      await db.conversations.update(id, {
        ...values,
        description: values.description ?? undefined,
        avatarUrl: photo ?? undefined,
      });
      onClose();
    } catch {
      setError("Не удалось сохранить настройки группы.");
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    const target = eligible?.find((member) => member.id === nextOwner);
    if (
      !http ||
      busy ||
      !target ||
      !window.confirm(
        `Передать владение участнику «${target.label}»? Вы останетесь администратором. Несохранённые изменения группы будут сброшены.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await http.put(`/v1/conversations/${id}/owner`, { principalId: target.id });
      onTransfer();
      onClose();
    } catch {
      setError("Не удалось передать владение.");
    } finally {
      setBusy(false);
    }
  }

  if (creatingTopic) {
    const back = () => setCreatingTopic(false);
    return (
      <TopicEditorDialog
        conversationId={id}
        onClose={back}
        onBack={back}
        onSaved={onTopicCreated}
      />
    );
  }

  return (
    <ChatDialog title="Управление группой" onClose={onClose} busy={busy}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.manageIdentity}>
          <button
            className={styles.avatarEdit}
            type="button"
            disabled={busy}
            aria-label="Сменить аватар"
            onClick={() => input.current?.click()}
          >
            <Avatar name={name} src={photoUrl(photo)} size="lg" />
          </button>
          <Input
            label="Название группы"
            value={name}
            maxLength={255}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              setPhoto(await groupPhoto(file));
            } catch {
              setError("Выберите JPEG, PNG или WebP до 5 МБ.");
            } finally {
              setBusy(false);
            }
          }}
        />
        {photo && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setPhoto(null)}
          >
            Удалить аватар
          </Button>
        )}
        <label className={styles.manageField}>
          Описание группы
          <textarea
            value={about}
            maxLength={1024}
            rows={3}
            onChange={(event) => setAbout(event.target.value)}
          />
        </label>
        <section className={styles.sharedSection}>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setCreatingTopic(true)}
          >
            Создать тему
          </Button>
        </section>
        {eligible && eligible.length > 0 && (
          <section className={styles.sharedSection}>
            <label className={styles.manageField}>
              Новый владелец
              <select
                value={nextOwner}
                onChange={(event) => setNextOwner(event.target.value)}
              >
                <option value="">Выберите участника</option>
                {eligible.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              disabled={!nextOwner || busy}
              onClick={() => void transfer()}
            >
              Передать владение
            </Button>
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        <div className={styles.footer}>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            Сохранить
          </Button>
        </div>
      </form>
    </ChatDialog>
  );
}
