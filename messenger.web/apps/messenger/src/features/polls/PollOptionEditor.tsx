import { IconButton } from "@dio/messenger-ui";
import { useRef, useState } from "react";
import type { PollOptionDraft } from "./pollOptions.js";
import styles from "./Poll.module.css";

const emojis = ["😊", "👍", "❤️", "🎉", "👀", "🤝", "✅", "🔥", "🚀", "⭐", "📌", "🙌"];

export function PollOptionEditor({
  option,
  index,
  onChange,
  onRemove,
  allowMedia,
}: {
  option: PollOptionDraft;
  index: number;
  onChange: (option: PollOptionDraft) => void;
  onRemove?: () => void;
  allowMedia: boolean;
}) {
  const [tools, setTools] = useState<"attach" | "emoji">();
  const labelRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const caret = useRef(0);
  function insertEmoji(emoji: string) {
    const start = labelRef.current?.selectionStart ?? caret.current;
    const end = labelRef.current?.selectionEnd ?? start;
    const label = option.label.slice(0, start) + emoji + option.label.slice(end);
    if (label.length > 256) return;
    onChange({ ...option, label });
    setTools(undefined);
    requestAnimationFrame(() => {
      labelRef.current?.focus();
      labelRef.current?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <div className={styles.optionEditor}>
      <div className={styles.optionInput}>
        <input
          ref={labelRef}
          aria-label={`Вариант ${index + 1}`}
          placeholder="Текст варианта"
          required
          maxLength={256}
          value={option.label}
          onChange={(event) => onChange({ ...option, label: event.target.value })}
        />
        <IconButton
          label={`Эмодзи к варианту ${index + 1}`}
          icon="emoji"
          size="sm"
          aria-expanded={tools === "emoji"}
          onClick={() => setTools(tools === "emoji" ? undefined : "emoji")}
        />
        <IconButton
          label={`Вложение к варианту ${index + 1}`}
          icon="attach"
          size="sm"
          aria-expanded={tools === "attach"}
          onClick={() => setTools(tools === "attach" ? undefined : "attach")}
        />
        {onRemove && (
          <button
            type="button"
            className={styles.compact}
            aria-label={`Удалить вариант ${index + 1}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      {tools === "emoji" && (
        <div className={styles.emoji} role="group" aria-label="Выбрать эмодзи">
          {emojis.map((emoji) => (
            <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
      {tools === "attach" && (
        <div className={styles.optionTools}>
          <input
            type="url"
            value={option.link}
            maxLength={2083}
            aria-label={`Ссылка для варианта ${index + 1}`}
            placeholder="https://…"
            onChange={(event) => onChange({ ...option, link: event.target.value })}
          />
          {allowMedia && (
            <button type="button" onClick={() => fileRef.current?.click()}>
              Выбрать файл
            </button>
          )}
          <input
            type="file"
            hidden
            ref={fileRef}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onChange({ ...option, file });
              event.target.value = "";
            }}
          />
        </div>
      )}
      {option.file && (
        <div className={styles.selectedFile}>
          <span>{option.file.name}</span>
          <button
            type="button"
            aria-label="Убрать вложение"
            onClick={() => onChange({ ...option, file: undefined })}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
