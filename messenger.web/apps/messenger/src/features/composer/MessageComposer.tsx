import {
  editMessage,
  readMessageBlocks,
  sendMessage,
  upsertDraft,
  type ContentBlock,
} from "@dio/messenger-core";
import { Icon, IconButton } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider.js";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { MentionTicketPicker } from "./MentionTicketPicker.js";
import { useUiStore } from "../../stores/uiStore.js";
import styles from "./MessageComposer.module.css";

export function MessageComposer() {
  const conversationId = useUiStore((state) => state.selectedConversationId);
  const { accountKey } = useRuntime();
  if (!conversationId || !accountKey) return null;
  return (
    <ConversationComposer
      key={JSON.stringify([accountKey, conversationId])}
      conversationId={conversationId}
    />
  );
}

function ConversationComposer({ conversationId }: { conversationId: string }) {
  const { db, sync, accountKey, media, http } = useRuntime();
  const { session } = useAuth();
  const reply = useUiStore((s) => s.replyTarget);
  const clearReply = useUiStore((s) => s.setReplyTarget);
  const editingId = useUiStore((s) => s.editingMessageId);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const [text, setText] = useState("");
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [failedUpload, setFailedUpload] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"mention" | "ticket" | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draftText, setDraftText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [attachments, setAttachments] = useState<
    NonNullable<import("@dio/messenger-core").Draft["attachments"]>
  >([]);
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 5 * 22 + 18;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  };

  useEffect(() => {
    resizeInput();
  }, [text]);

  const draft = useLiveQuery(async () => {
    if (!db || !accountKey || !conversationId) return null;
    const stored = await db.drafts.get(`${accountKey}::${conversationId}`);
    if (!stored) return null;
    if (stored.draftReply || !stored.replyToId) return stored;
    const source = await db.messages.get(stored.replyToId);
    if (source?.conversationId !== conversationId) return stored;
    return {
      ...stored,
      draftReply: {
        localId: source.localId,
        serverId: source.serverId,
        preview: source.content,
      },
    };
  }, [db, accountKey, conversationId]);

  useEffect(() => {
    if (hydrated || draft === undefined || !db) return;
    setText(draft?.content ?? "");
    setDraftText(draft?.content ?? "");
    setAttachments(draft?.attachments ?? []);
    setMentions(draft?.mentionTokens ?? {});
    if (draft?.draftReply && !useUiStore.getState().replyTarget)
      clearReply(draft.draftReply);
    setHydrated(true);
  }, [draft, hydrated, db, clearReply]);

  useEffect(() => {
    if (!db || !accountKey || !hydrated || editingId || sending) return;
    void upsertDraft(
      db,
      accountKey,
      conversationId,
      draftText,
      reply?.localId,
      reply ?? undefined,
      attachments,
      mentions,
    ).catch(() => setSendError("Не удалось сохранить черновик"));
  }, [
    db,
    accountKey,
    conversationId,
    draftText,
    reply,
    editingId,
    hydrated,
    sending,
    attachments,
    mentions,
  ]);

  useEffect(() => {
    if (!editingId || !db) return;
    let cancelled = false;
    void db.messages.get(editingId).then((row) => {
      if (!cancelled && row) {
        setText(
          readMessageBlocks(row)
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n"),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editingId, db]);

  useEffect(() => {
    if (!sync || !hydrated) return;
    const previous = typingTimer.current;
    if (previous) clearTimeout(previous);
    if (!text.trim() || editingId) {
      if (previous) sync.sendTyping(conversationId, false);
      typingTimer.current = null;
      return;
    }
    if (!previous) sync.sendTyping(conversationId, true);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      sync.sendTyping(conversationId, false);
    }, 2_500);
  }, [text, conversationId, sync, hydrated, editingId]);

  useEffect(() => {
    return () => {
      if (!typingTimer.current) return;
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
      sync?.sendTyping(conversationId, false);
    };
  }, [conversationId, sync]);

  const onSend = async () => {
    if (!db || !accountKey || !session || !hydrated || sendLock.current) return;
    if (!text.trim() && (!attachments.length || editingId)) return;
    sendLock.current = true;
    setSending(true);
    setSendError(null);

    try {
      if (editingId) {
        await editMessage(db, accountKey, {
          conversationId,
          localId: editingId,
          content: text.trim(),
        });
        if (useUiStore.getState().editingMessageId === editingId) setEditing(null);
        setText(draftText);
        sync?.requestFlush();
        return;
      }

      const usedMentions = new Set(
        text
          .match(/@[\p{L}\p{N}_.-]+/gu)
          ?.map((handle) => handle.replace(/[.-]+$/, "")),
      );
      await sendMessage(db, accountKey, {
        conversationId,
        clearConversationDraft: true,
        content: text.trim(),
        authorId: session.userId,
        extraBlocks: attachments.map((attachment): ContentBlock => attachment.block),
        mentions: [
          ...new Set(
            Object.entries(mentions)
              .filter(([token]) => usedMentions.has(token))
              .map(([, id]) => id),
          ),
        ],
        ...(reply
          ? {
              replyToLocalId: reply.localId,
              replyToId: reply.serverId,
              replyPreview: reply.preview,
              quoteText: reply.quoteText,
            }
          : {}),
      });
      setDraftText("");
      setAttachments([]);
      setMentions({});
      if (useUiStore.getState().selectedConversationId === conversationId) {
        setText("");
        clearReply(null);
      }
      sync?.sendTyping(conversationId, false);
      sync?.requestFlush();
    } catch {
      setSendError("Не удалось сохранить сообщение для отправки");
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const onAttach = async (fileList: FileList | null) => {
    if (!fileList?.length || !conversationId || !media) return;
    const file = fileList.item(0);
    if (!file) return;
    setUploadNote(`Загрузка ${file.name}…`);
    try {
      await media.enqueue(file, conversationId);
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!media || !hydrated || editingId || sending) return;
    const updateJobs = () => {
      for (const job of media.getJobs()) {
        if (job.conversationId !== conversationId) continue;
        if (job.status === "ready" && job.assetId) {
          const assetId = job.assetId;
          media.dismiss(job.id);
          setAttachments((items) =>
            items.some(
              ({ block }) => block.type === "media" && block.assetId === assetId,
            )
              ? items
              : [...items, { label: job.file.name, block: { type: "media", assetId } }],
          );
          setUploadNote(null);
          setFailedUpload((current) => (current === job.id ? null : current));
        } else if (job.status === "failed") {
          setUploadNote(job.error ?? "Ошибка загрузки");
          setFailedUpload(job.id);
        }
      }
    };
    updateJobs();
    return media.subscribe(updateJobs);
  }, [media, conversationId, hydrated, editingId, sending]);

  function updateText(value: string) {
    setText(value);
    if (!editingId) setDraftText(value);
  }

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
              setText(draftText);
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
          onPick={(token, id) => {
            if (pickerMode === "mention") {
              updateText(text.replace(/@[\p{L}\p{N}_.-]*$/u, token + " "));
              setMentions((current) => ({ ...current, [token]: id }));
            } else {
              updateText(text.replace(/#[\p{L}\p{N}_-]*$/u, ""));
              setAttachments((items) => [
                ...items,
                {
                  label: token,
                  block: {
                    type: "resource",
                    provider: "dio-desk",
                    resourceType: "ticket",
                    resourceId: id,
                    number: token.slice(1),
                  },
                },
              ]);
            }
            setPickerMode(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      ) : null}
      {!editingId
        ? attachments.map((attachment, index) => (
            <button
              key={index}
              type="button"
              className={styles.attachment}
              aria-label={`Убрать ${attachment.label}`}
              onClick={() =>
                setAttachments((items) => items.filter((_, i) => i !== index))
              }
            >
              {attachment.label} ×
            </button>
          ))
        : null}
      <div className={styles.composerShell}>
        <div className={styles.composerRow}>
          <textarea
            ref={inputRef}
            className={[styles.input, "dio-scroll"].join(" ")}
            value={text}
            rows={1}
            disabled={!hydrated || sending}
            aria-label="Текст сообщения"
            placeholder="Написать сообщение…"
            onChange={(e) => {
              const value = e.target.value;
              updateText(value);
              if (/@[\p{L}\p{N}_.-]*$/u.test(value) && !editingId)
                setPickerMode("mention");
              else if (/#[\p{L}\p{N}_-]*$/u.test(value) && !editingId)
                setPickerMode("ticket");
              else setPickerMode(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (
                pickerMode &&
                (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape")
              ) {
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !pickerMode) {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <div className={styles.toolsTrailing}>
            <IconButton
              label="Эмодзи"
              icon="emoji"
              size="sm"
              iconSize={20}
              onClick={() => {
                setEmojiOpen((value) => !value);
                setPickerMode(null);
              }}
              disabled={!hydrated || sending}
            />
            <IconButton
              label="Упомянуть участника"
              icon="mention"
              size="sm"
              iconSize={20}
              disabled={!hydrated || sending || !!editingId}
              onClick={() => {
                updateText(text + (text && !text.endsWith(" ") ? " @" : "@"));
                setPickerMode("mention");
                setEmojiOpen(false);
                inputRef.current?.focus();
              }}
            />
            <IconButton
              label="Заявка"
              icon="hash"
              size="sm"
              iconSize={20}
              disabled={!hydrated || sending || !!editingId}
              onClick={() => {
                updateText(text.endsWith(" ") || !text ? text + "#" : text + " #");
                setPickerMode("ticket");
                setEmojiOpen(false);
                inputRef.current?.focus();
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => void onAttach(e.target.files)}
            />
            <IconButton
              label="Вложение"
              icon="attach"
              size="sm"
              iconSize={20}
              disabled={!!editingId || sending || !hydrated}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
        </div>
        <div className={styles.sendSlot}>
          <IconButton
            label="Отправить"
            icon="send"
            variant="send"
            iconSize={18}
            onClick={() => void onSend()}
            disabled={
              !hydrated ||
              sending ||
              (!text.trim() && (!attachments.length || !!editingId))
            }
          />
        </div>
      </div>
      {emojiOpen ? (
        <div
          className={styles.emojiPicker}
          role="group"
          aria-label="Выбрать эмодзи"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setEmojiOpen(false);
              inputRef.current?.focus();
            }
          }}
        >
          {["😊", "👍", "❤️", "🎉", "👀", "🤝", "✅", "🔥"].map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                updateText(text + emoji);
                setEmojiOpen(false);
                inputRef.current?.focus();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {uploadNote ? (
        <p className={styles.note} role="status">
          {uploadNote}{" "}
          {failedUpload ? (
            <button
              type="button"
              onClick={() => {
                media?.retry(failedUpload);
                setFailedUpload(null);
                setUploadNote("Повторная загрузка…");
              }}
            >
              Повторить
            </button>
          ) : null}
        </p>
      ) : null}
      {sendError ? (
        <p role="alert" className={styles.note}>
          {sendError}
        </p>
      ) : null}
    </div>
  );
}
