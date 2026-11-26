import { useState } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { ChatDialog } from "../../widgets/ChatDialog.js";
import styles from "./Poll.module.css";

export function PollComposer({
  conversationId,
  threadId,
  onClose,
}: {
  conversationId: string;
  threadId?: string;
  onClose: () => void;
}) {
  const { http, sync } = useRuntime();
  const [clientMessageId] = useState(() => crypto.randomUUID());
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [showVoters, setShowVoters] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [allowsRevoting, setAllowsRevoting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const labels = options.map((option) => option.trim());
  const valid =
    !!question.trim() &&
    labels.every(Boolean) &&
    new Set(labels.map((label) => label.toLowerCase())).size === labels.length;

  async function publish() {
    if (!http || !valid || busy) return;
    setBusy(true);
    setError(false);
    try {
      await http.post(`/v1/conversations/${conversationId}/polls`, {
        clientMessageId,
        question: question.trim(),
        options: labels,
        showVoters,
        allowsMultiple,
        allowsRevoting,
        threadId,
      });
      void sync?.synchronize().catch(() => undefined);
      onClose();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <ChatDialog title="Новый опрос" onClose={onClose} busy={busy} variant="fullscreen">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void publish();
        }}
      >
        <label>
          Вопрос
          <textarea
            required
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Варианты ответа</legend>
          {options.map((option, index) => (
            <div className={styles.optionInput} key={index}>
              <input
                aria-label={`Вариант ${index + 1}`}
                required
                maxLength={256}
                value={option}
                onChange={(event) =>
                  setOptions((items) =>
                    items.map((item, i) => (i === index ? event.target.value : item)),
                  )
                }
              />
              {options.length > 2 && (
                <button
                  type="button"
                  aria-label={`Удалить вариант ${index + 1}`}
                  onClick={() =>
                    setOptions((items) => items.filter((_, i) => i !== index))
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            disabled={options.length >= 10}
            onClick={() => setOptions((items) => [...items, ""])}
          >
            Добавить вариант
          </button>
        </fieldset>
        <fieldset>
          <legend>Настройки</legend>
          <label>
            <input
              type="checkbox"
              checked={showVoters}
              onChange={(event) => setShowVoters(event.target.checked)}
            />{" "}
            Показывать, кто голосовал
          </label>
          <label>
            <input
              type="checkbox"
              checked={allowsMultiple}
              onChange={(event) => setAllowsMultiple(event.target.checked)}
            />{" "}
            Несколько ответов
          </label>
          <label>
            <input
              type="checkbox"
              checked={allowsRevoting}
              onChange={(event) => setAllowsRevoting(event.target.checked)}
            />{" "}
            Разрешить изменить голос
          </label>
        </fieldset>
        {error && <p role="alert">Не удалось создать опрос. Повторите попытку.</p>}
        <footer className={styles.actions}>
          <button type="button" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={busy || !valid || !http}>
            {busy ? "Публикация…" : "Создать опрос"}
          </button>
        </footer>
      </form>
    </ChatDialog>
  );
}
