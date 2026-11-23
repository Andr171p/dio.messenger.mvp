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
import { MentionTicketPicker } from "./MentionTicketPicker.js";
import { useUiStore } from "../../stores/uiStore.js";
import styles from "./MessageComposer.module.css";

export function MessageComposer() {
  const { db, sync, accountKey, media, http } = useRuntime();
  const { session } = useAuth();
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const reply = useUiStore((s) => s.replyTarget);
  const clearReply = useUiStore((s) => s.setReplyTarget);
  const editingId = useUiStore((s) => s.editingMessageId);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const [text, setText] = useState("");
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"mention" | "ticket" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftConvRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draft = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return null;
    return db.drafts.get(`${accountKey}::${conversationId}`);
  }, [db, accountKey, conversationId]);

  // Load draft only for the conversation being entered
  useEffect(() => {
    if (!conversationId) {
      setText("");
      draftConvRef.current = null;
      return;
    }
    if (draftConvRef.current === conversationId) return;
    draftConvRef.current = conversationId;
    setText(draft?.content ?? "");
  }, [conversationId, draft?.content]);

  // Persist draft bound to the conversation that owned the debounce start
  useEffect(() => {
    if (!db || !accountKey || !conversationId || editingId) return;
    const boundConversationId = conversationId;
    const boundText = text;
    const boundReply = reply?.localId;
    const timer = setTimeout(() => {
      if (draftConvRef.current !== boundConversationId) return;
      void upsertDraft(db, accountKey, boundConversationId, boundText, boundReply);
    }, 300);
    return () => clearTimeout(timer);
  }, [db, accountKey, conversationId, text, reply?.localId, editingId]);

  useEffect(() => {
    if (!editingId || !db) return;
    void db.messages.get(editingId).then((row) => {
      if (row) setText(row.content);
    });
  }, [editingId, db]);

  useEffect(() => {
    if (!conversationId || !sync || !text) return;
    sync.sendTyping(conversationId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      sync.sendTyping(conversationId, false);
    }, 2_500);
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [text, conversationId, sync]);

  const onSend = async () => {
    if (!db || !accountKey || !conversationId || !session || !text.trim()) return;
    const boundConversationId = conversationId;

    if (editingId) {
      await editMessage(db, accountKey, {
        conversationId: boundConversationId,
        localId: editingId,
        content: text.trim(),
      });
      setEditing(null);
      setText("");
      sync?.requestFlush();
      return;
    }

    await sendMessage(db, accountKey, {
      conversationId: boundConversationId,
      content: text.trim(),
      authorId: session.userId,
      ...(reply
        ? {
            replyToLocalId: reply.localId,
            replyToId: reply.serverId,
            replyPreview: reply.preview,
            quoteText: reply.quoteText,
          }
        : {}),
    });
    if (draftConvRef.current === boundConversationId) {
      await clearDraft(db, accountKey, boundConversationId);
      setText("");
      clearReply(null);
    }
    sync?.sendTyping(boundConversationId, false);
    sync?.requestFlush();
  };

  const onAttach = async (fileList: FileList | null) => {
    if (!fileList?.length || !conversationId || !media) return;
    const file = fileList.item(0);
    if (!file) return;
    setUploadNote(`Загрузка ${file.name}…`);
    try {
      const jobId = await media.enqueue(file, conversationId);
      for (let i = 0; i < 60; i += 1) {
        const job = media.getJobs().find((j) => j.id === jobId);
        if (!job) break;
        if (job.status === "ready" && job.assetId) {
          setUploadNote(`Вложение: ${file.name}`);
          setText((prev) =>
            prev.trim() ? `${prev}\n[media:${job.assetId}]` : `[media:${job.assetId}]`,
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
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!conversationId) return null;

  return (
    <div className={styles.root}>
      {reply ? (
        <div className={styles.replyBar}>
          <Icon name="reply" size={16} />
          <span className={styles.replyText}>
            {reply.quoteText ? `«${reply.quoteText}»` : reply.preview}
          </span>
          <button type="button" onClick={() => clearReply(null)}>
            Отмена
          </button>
        </div>
      ) : null}
      {editingId ? (
        <div className={styles.editBar}>
          <Icon name="edit" size={14} /> Редактирование
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setText("");
            }}
          >
            Отмена
          </button>
        </div>
      ) : null}
      {pickerMode ? (
        <MentionTicketPicker
          mode={pickerMode}
          conversationId={conversationId}
          http={http}
          query={text}
          onPick={(token) => {
            setText((prev) => {
              if (pickerMode === "mention") {
                return prev.replace(/@[\w.-]*$/, token + " ");
              }
              return prev.replace(/#[\w-]*$/, token + " ");
            });
            setPickerMode(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      ) : null}
      <div className={styles.composerRow}>
        <textarea
          className={styles.input}
          value={text}
          rows={2}
          placeholder="Написать сообщение…"
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            if (/@[\w.-]*$/.test(value)) setPickerMode("mention");
            else if (/#[\w-]*$/.test(value)) setPickerMode("ticket");
            else setPickerMode(null);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (pickerMode && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape")) {
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !pickerMode) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <div className={styles.tools}>
          <button type="button" aria-label="Эмодзи" onClick={() => setText((p) => p + "😊 ")}>
            <Icon name="emoji" size={18} />
          </button>
          <button
            type="button"
            aria-label="Упоминание"
            onClick={() => {
              setText((p) => (p.endsWith(" ") || !p ? p + "@" : `${p} @`));
              setPickerMode("mention");
            }}
          >
            <Icon name="mention" size={18} />
          </button>
          <button
            type="button"
            aria-label="Заявка"
            onClick={() => {
              setText((p) => (p.endsWith(" ") || !p ? p + "#" : `${p} #`));
              setPickerMode("ticket");
            }}
          >
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
