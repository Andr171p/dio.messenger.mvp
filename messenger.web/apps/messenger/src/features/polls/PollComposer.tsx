import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { ChatDialog } from "../../widgets/ChatDialog.js";
import { useConversationPolicy } from "../conversation/useConversationPolicy.js";
import { PollOptionEditor } from "./PollOptionEditor.js";
import { emptyPollOption, uploadPollOptions, validPollOption } from "./pollOptions.js";
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
  const policy = useConversationPolicy(conversationId);
  const [clientMessageId] = useState(() => crypto.randomUUID());
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(() => [emptyPollOption(), emptyPollOption()]);
  const [showVoters, setShowVoters] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [allowsRevoting, setAllowsRevoting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploaded = useRef(new Map<File, string>());
  const request = useRef<AbortController>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const labels = options.map((option) => option.label.trim());
  const valid =
    !!question.trim() &&
    options.every(validPollOption) &&
    new Set(labels.map((label) => label.toLowerCase())).size === labels.length;

  async function publish() {
    if (!http || !valid || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const optionDetails = await uploadPollOptions(
        options,
        http,
        conversationId,
        uploaded.current,
        controller.signal,
      );
      await http.request(`/v1/conversations/${conversationId}/polls`, {
        method: "POST",
        signal: controller.signal,
        json: {
          clientMessageId,
          question: question.trim(),
          description: description.trim() || undefined,
          options: labels,
          optionDetails,
          showVoters,
          allowsMultiple,
          allowsRevoting,
          threadId,
        },
      });
      void sync?.synchronize().catch(() => undefined);
      onClose();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error && failure.message.startsWith("Не удалось")
            ? failure.message
            : "Не удалось опубликовать опрос. Повторите попытку.",
        );
        setBusy(false);
      }
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
        <fieldset disabled={busy}>
          <legend>Вопрос</legend>
          <textarea
            aria-label="Вопрос"
            placeholder="Задайте вопрос"
            required
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <textarea
            aria-label="Описание"
            placeholder="Добавить описание"
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Варианты ответа</legend>
          {options.map((option, index) => (
            <PollOptionEditor
              key={option.id}
              index={index}
              option={option}
              allowMedia={policy.data?.allowAttachments !== false}
              onChange={(updated) =>
                setOptions((items) =>
                  items.map((item) => (item.id === option.id ? updated : item)),
                )
              }
              onRemove={
                options.length > 2
                  ? () =>
                      setOptions((items) =>
                        items.filter((item) => item.id !== option.id),
                      )
                  : undefined
              }
            />
          ))}
          {options.length < 10 && (
            <button
              className={styles.addOption}
              type="button"
              onClick={() => setOptions((items) => [...items, emptyPollOption()])}
            >
              ＋ <span>Добавить вариант</span>
            </button>
          )}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Настройки</legend>
          <label className={styles.setting}>
            Показывать, кто голосовал
            <input
              type="checkbox"
              role="switch"
              checked={showVoters}
              onChange={(event) => setShowVoters(event.target.checked)}
            />
          </label>
          <label className={styles.setting}>
            Несколько ответов
            <input
              type="checkbox"
              role="switch"
              checked={allowsMultiple}
              onChange={(event) => setAllowsMultiple(event.target.checked)}
            />
          </label>
          <label className={styles.setting}>
            Разрешить изменить голос
            <input
              type="checkbox"
              role="switch"
              checked={allowsRevoting}
              onChange={(event) => setAllowsRevoting(event.target.checked)}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
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
