import {
  clearDraft,
  editMessage,
  sendMessage,
  upsertDraft,
} from "@dio/messenger-core";
import { Button, Icon } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider.js";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { useUiStore } from "../../stores/uiStore.js";
import styles from "./MessageComposer.module.css";

export function MessageComposer() {
  const { db, sync, accountKey, media } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const reply = useUiStore((s) => s.replyTarget);
  const clearReply = useUiStore((s) => s.setReplyTarget);
  const editingId = useUiStore((s) => s.editingMessageId);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const [text, setText] = useState("");
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draft = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return null;
    return db.drafts.get(`${accountKey}::${conversationId}`);
  }, [db, accountKey, conversationId]);

  useEffect(() => {
    if (draft?.content && !text && !editingId) {
      setText(draft.content);
    }
  }, [draft?.content, text, editingId]);

  useEffect(() => {
    if (!db || !accountKey || !conversationId || editingId) return;
    const timer = setTimeout(() => {
      void upsertDraft(db, accountKey, conversationId, text, reply?.localId);
    }, 300);
    return () => clearTimeout(timer);
  }, [db, accountKey, conversationId, text, reply?.localId, editingId]);

  useEffect(() => {
    if (!editingId || !db) return;
    void db.messages.get(editingId).then((row) => {
      if (row) setText(row.content);
    });
  }, [editingId, db]);

  const onSend = async () => {
    if (!db || !accountKey || !conversationId || !session || !text.trim()) return;

    if (editingId) {
      await editMessage(db, accountKey, {
        conversationId,
        localId: editingId,
        content: text.trim(),
      });
      setEditing(null);
      setText("");
      sync?.requestFlush();
      return;
    }

    await sendMessage(db, accountKey, {
      conversationId,
      content: text.trim(),
      authorId: session.userId,
      ...(reply?.localId ? { replyToId: reply.localId } : {}),
    });
    await clearDraft(db, accountKey, conversationId);
    setText("");
    clearReply(null);
    sync?.requestFlush();
  };

  const onAttach = async (fileList: FileList | null) => {
    if (!fileList?.length || !conversationId || !media) return;
    const file = fileList.item(0);
    if (!file) return;
    setUploadNote(`Загрузка ${file.name}…`);
    try {
      const jobId = await media.enqueue(file, conversationId);
      const waitReady = async () => {
        for (let i = 0; i < 60; i += 1) {
          const job = media.getJobs().find((j) => j.id === jobId);
          if (!job) break;
          if (job.status === "ready" && job.assetId) {
            setUploadNote(`Вложение: ${file.name}`);
            setText((prev) =>
              prev.trim()
                ? `${prev}\n[media:${job.assetId}]`
                : `[media:${job.assetId}]`,
            );
            return;
          }
          if (job.status === "failed") {
            setUploadNote(job.error ?? "Ошибка загрузки");
            return;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        setUploadNote("Таймаут загрузки");
      };
      void waitReady();
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const insertToken = (token: string) => {
    setText((prev) => (prev.endsWith(" ") || !prev ? prev + token : `${prev} ${token}`));
  };

  if (!conversationId) return null;

  return (
    <div className={styles.root}>
      {reply ? (
        <div className={styles.replyBar}>
          <Icon name="reply" size={16} />
          <span className={styles.replyText}>{reply.preview}</span>
          <button type="button" onClick={() => clearReply(null)}>
            Отмена
          </button>
        </div>
      ) : null}
      {editingId ? (
        <div className={styles.editBar}>
          <Icon name="edit" size={14} /> Редактирование
          <button type="button" onClick={() => { setEditing(null); setText(""); }}>
            Отмена
          </button>
        </div>
      ) : null}
      <div className={styles.composerRow}>
        <textarea
          className={styles.input}
          value={text}
          rows={2}
          placeholder="Написать сообщение…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <div className={styles.tools}>
          <button type="button" aria-label="Эмодзи" onClick={() => insertToken("😊 ")}>
            <Icon name="emoji" size={18} />
          </button>
          <button type="button" aria-label="Упоминание" onClick={() => insertToken("@")}>
            <Icon name="mention" size={18} />
          </button>
          <button type="button" aria-label="Хештег" onClick={() => insertToken("#")}>
            <Icon name="hash" size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => void onAttach(e.target.files)}
          />
          <button
            type="button"
            aria-label="Вложение"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="attach" size={18} />
          </button>
          <Button
            variant="send"
            aria-label="Отправить"
            onClick={() => void onSend()}
            disabled={!text.trim()}
          >
            <Icon name="send" size={18} />
          </Button>
        </div>
      </div>
      {uploadNote ? <p className={styles.note}>{uploadNote}</p> : null}
    </div>
  );
}