import {
  editMessage,
  readMessageBlocks,
  saveVoiceRecording,
  sendMessage,
  upsertDraft,
  type ContentBlock,
} from "@dio/messenger-core";
import { Icon, IconButton } from "@dio/messenger-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/providers/AuthProvider.js";
import { useRuntime } from "../../app/providers/RuntimeProvider.js";
import { useConversationPolicy } from "../conversation/useConversationPolicy.js";
import { MentionTicketPicker } from "./MentionTicketPicker.js";
import { VoiceRecorder } from "./VoiceRecorder.js";
import { useUiStore } from "../../stores/uiStore.js";
import { maskSpoilers } from "../../widgets/MessageFormatting.js";
import styles from "./MessageComposer.module.css";

const formats = [
  ["Жирный", "**", "b"],
  ["Курсив", "*", "i"],
  ["Подчёркнутый", "__", "u"],
  ["Зачёркнутый", "~~", "x"],
  ["Скрытый текст", "||", "s"],
  ["Моноширинный", "\x60", "m"],
] as const;
type ComposerTool = "mention" | "ticket" | "emoji" | "attach" | "format";

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
  const { data: policy } = useConversationPolicy(conversationId);
  const { session } = useAuth();
  const reply = useUiStore((s) => s.replyTarget);
  const clearReply = useUiStore((s) => s.setReplyTarget);
  const editingId = useUiStore((s) => s.editingMessageId);
  const setEditing = useUiStore((s) => s.setEditingMessageId);
  const [text, setText] = useState("");
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [failedUpload, setFailedUpload] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"mention" | "ticket" | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [tool, setTool] = useState<ComposerTool | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverOpened = useRef(false);
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
  const lastTyping = useRef(0);
  const reportVoiceRecording = useCallback(
    (active: boolean) => sync?.sendTyping(conversationId, active, "recording_audio"),
    [sync, conversationId],
  );

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
    inputRef.current?.focus({ preventScroll: true });
    sendLock.current = true;
    setSending(true);
    setSendError(null);
    if (!editingId) {
      setText("");
      setDraftText("");
      setPickerMode(null);
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        typingTimer.current = null;
        sync?.sendTyping(conversationId, false);
      }
    }

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
      setAttachments([]);
      setMentions({});
      if (useUiStore.getState().selectedConversationId === conversationId) {
        clearReply(null);
      }
      sync?.requestFlush();
    } catch {
      if (!editingId) {
        const restore = (current: string) => (current ? text + "\n" + current : text);
        setText(restore);
        setDraftText(restore);
      }
      setSendError("Не удалось сохранить сообщение для отправки");
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const onAttach = async (fileList: FileList | null) => {
    if (policy?.allowAttachments === false) return;
    if (!fileList?.length || !conversationId || !media) return;
    const file = fileList.item(0);
    if (!file) return;
    if (policy && file.size > policy.maxAttachmentBytes) {
      setFailedUpload(null);
      setUploadNote("Размер файла превышает лимит беседы");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploadNote(`Загрузка ${file.name}…`);
    try {
      await media.enqueue(file, conversationId);
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onVoiceRecording = async (file: File) => {
    if (
      !db ||
      !accountKey ||
      !media ||
      !session ||
      policy?.allowAttachments === false
    ) {
      throw new Error("Голосовое сообщение недоступно в этой беседе.");
    }
    let voiceUploadId: string;
    try {
      voiceUploadId = await saveVoiceRecording(db, accountKey, {
        conversationId,
        blob: file,
        contentType: file.type || "audio/webm",
        filename: file.name,
        send: reply ? { draftReply: reply } : {},
      });
    } catch {
      throw new Error("Не удалось сохранить голосовое для отправки.");
    }
    if (reply && useUiStore.getState().replyTarget === reply) clearReply(null);
    await media.enqueue(file, conversationId, {
      presentation: "voice",
      voiceUploadId,
      sendAsMessage: true,
    });
  };

  useEffect(() => {
    if (!media || !hydrated || editingId || sending) return;
    const updateJobs = () => {
      for (const job of media.getJobs()) {
        if (job.conversationId !== conversationId) continue;
        if (job.status === "ready" && job.assetId) {
          const assetId = job.assetId;
          media.dismiss(job.id);
          if (job.sendAsMessage) {
            setUploadNote(null);
            setFailedUpload((current) => (current === job.id ? null : current));
            continue;
          }
          const block =
            job.presentation && job.presentation !== "file"
              ? { type: "media" as const, assetId, presentation: job.presentation }
              : { type: "media" as const, assetId };
          setAttachments((items) =>
            items.some(
              ({ block }) => block.type === "media" && block.assetId === assetId,
            )
              ? items
              : [...items, { label: job.file.name, block }],
          );
          setUploadNote(null);
          setFailedUpload((current) => (current === job.id ? null : current));
        } else if (job.status === "failed") {
          setUploadNote(job.error ?? "Ошибка загрузки");
          setFailedUpload(job.retryable ? job.id : null);
        } else if (job.status === "scanning" || job.status === "completing") {
          setUploadNote(`Проверка файла ${job.file.name}…`);
        } else if (job.status === "uploading") {
          setUploadNote(`Загрузка ${job.file.name}…`);
        }
      }
    };
    updateJobs();
    return media.subscribe(updateJobs);
  }, [media, conversationId, hydrated, editingId, sending]);

  function updateText(value: string) {
    setText(value);
    if (!editingId) setDraftText(value);
    if (!sync || editingId) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (!value.trim()) {
      if (typingTimer.current) sync.sendTyping(conversationId, false);
      typingTimer.current = null;
      return;
    }
    if (!typingTimer.current || Date.now() - lastTyping.current >= 3_000) {
      lastTyping.current = Date.now();
      sync.sendTyping(conversationId, true);
    }
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      sync.sendTyping(conversationId, false);
    }, 2_500);
  }

  function closeTools() {
    clearTimeout(closeTimer.current);
    setPickerMode(null);
    setTool(null);
  }

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target))
        closeTools();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      clearTimeout(closeTimer.current);
    };
  }, []);

  function openTool(next: ComposerTool, hover: boolean) {
    clearTimeout(closeTimer.current);
    hoverOpened.current = hover;
    setTool(next);
    setPickerMode(next === "mention" || next === "ticket" ? next : null);
  }

  function activateTool(next: ComposerTool, event: React.MouseEvent) {
    openTool(next, event.detail > 0 && window.matchMedia("(hover: hover)").matches);
    if (event.detail === 0) {
      requestAnimationFrame(() =>
        rootRef.current
          ?.querySelector<HTMLElement>(
            "[data-composer-popup] input, [data-composer-popup] button",
          )
          ?.focus({ preventScroll: true }),
      );
    }
  }

  function scheduleClose(event: React.PointerEvent) {
    if (event.pointerType !== "mouse" || !hoverOpened.current) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeTools, 180);
  }

  const popupHover = {
    "data-composer-popup": true,
    onPointerEnter: () => clearTimeout(closeTimer.current),
    onPointerLeave: scheduleClose,
  };

  function hoverTool(next: ComposerTool, disabled = false) {
    return {
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse" && !disabled) openTool(next, true);
      },
      onPointerLeave: scheduleClose,
    };
  }

  function replaceSelection(
    value: string,
    suffix?: RegExp,
    after = "",
    select = false,
  ) {
    const input = inputRef.current;
    const end = input?.selectionEnd ?? text.length;
    let start = input?.selectionStart ?? end;
    if (suffix) start -= suffix.exec(text.slice(0, start))?.[0].length ?? 0;
    const body = select ? text.slice(start, end) : "";
    updateText(text.slice(0, start) + value + body + after + text.slice(end));
    requestAnimationFrame(() => {
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(
        start + value.length,
        start + value.length + body.length,
      );
    });
  }

  function chooseFile(accept = "") {
    closeTools();
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  }

  const disabled = !hydrated || sending;
  const attachDisabled = disabled || !!editingId || policy?.allowAttachments === false;

  return (
    <div
      className={styles.root}
      ref={rootRef}
      onPointerEnter={() => clearTimeout(closeTimer.current)}
      onPointerLeave={scheduleClose}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) closeTools();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (tool || pickerMode)) {
          event.preventDefault();
          event.stopPropagation();
          closeTools();
          inputRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      {reply ? (
        <div className={styles.replyBar}>
          <Icon name="reply" size={16} />
          <span className={styles.replyText}>
            {reply.quoteText
              ? `«${reply.quoteText}»`
              : maskSpoilers(reply.preview ?? "")}
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
        <div className={styles.pickerPopup} {...popupHover}>
          <MentionTicketPicker
            key={pickerMode}
            mode={pickerMode}
            conversationId={conversationId}
            http={http}
            query={tool ? "" : pickerQuery}
            showSearch={!!tool}
            onPick={(token, id) => {
              if (pickerMode === "mention") {
                replaceSelection(token + " ", /@[\p{L}\p{N}_.-]*$/u);
                setMentions((current) => ({ ...current, [token]: id }));
              } else {
                if (!tool) replaceSelection("", /#[\p{L}\p{N}_-]*$/u);
                setAttachments((items) =>
                  items.some(
                    ({ block }) => block.type === "resource" && block.resourceId === id,
                  )
                    ? items
                    : [
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
                      ],
                );
              }
              closeTools();
            }}
            onClose={closeTools}
          />
        </div>
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
      <VoiceRecorder
        onStart={() => {
          closeTools();
          if (typingTimer.current) {
            clearTimeout(typingTimer.current);
            typingTimer.current = null;
            sync?.sendTyping(conversationId, false);
          }
        }}
        onRecording={reportVoiceRecording}
        onSubmit={onVoiceRecording}
        maxBytes={policy?.maxAttachmentBytes ?? 50 * 1024 * 1024}
        disabled={attachDisabled || !media}
        idleSend={
          text.trim() || attachments.length || editingId ? (
            <div className={styles.sendSlot}>
              <IconButton
                label="Отправить"
                onMouseDown={(event) => event.preventDefault()}
                icon="send"
                variant="send"
                iconSize={18}
                onClick={() => void onSend()}
                disabled={
                  disabled || (!text.trim() && (!attachments.length || !!editingId))
                }
              />
            </div>
          ) : null
        }
      >
        <div className={styles.composerRow}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => void onAttach(e.target.files)}
          />
          <span {...hoverTool("attach", attachDisabled)}>
            <IconButton
              label={
                policy?.allowAttachments === false
                  ? "Вложения запрещены правилами беседы"
                  : "Вложение"
              }
              icon="attach"
              size="sm"
              iconSize={20}
              disabled={attachDisabled}
              aria-expanded={tool === "attach"}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                openTool("attach", false);
                requestAnimationFrame(() =>
                  rootRef.current
                    ?.querySelector<HTMLButtonElement>("[data-composer-popup] button")
                    ?.focus({ preventScroll: true }),
                );
              }}
              onClick={() => chooseFile()}
            />
          </span>
          <textarea
            ref={inputRef}
            className={[styles.input, "dio-scroll"].join(" ")}
            value={text}
            rows={1}
            disabled={!hydrated}
            readOnly={sending && !!editingId}
            aria-label="Текст сообщения"
            placeholder="Написать сообщение…"
            onChange={(e) => {
              const value = e.target.value;
              const before = value.slice(0, e.target.selectionStart);
              updateText(value);
              setPickerQuery(before);
              setTool(null);
              hoverOpened.current = false;
              if (/(?:^|\s)@[\p{L}\p{N}_.-]*$/u.test(before) && !editingId)
                setPickerMode("mention");
              else if (/(?:^|\s)#[\p{L}\p{N}_-]*$/u.test(before) && !editingId)
                setPickerMode("ticket");
              else setPickerMode(null);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const key = e.key.toLowerCase();
                const format = formats.find(
                  ([, , shortcut]) =>
                    shortcut === key && e.shiftKey === ["x", "s", "m"].includes(key),
                );
                if (format) {
                  e.preventDefault();
                  closeTools();
                  replaceSelection(format[1], undefined, format[1], true);
                  return;
                }
              }
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
            <span {...hoverTool("format", disabled)}>
              <button
                type="button"
                className={styles.formatButton}
                aria-label="Форматирование"
                aria-expanded={tool === "format"}
                disabled={disabled}
                onClick={(event) => activateTool("format", event)}
              >
                Aa
              </button>
            </span>
            <span {...hoverTool("emoji", disabled)}>
              <IconButton
                label="Эмодзи"
                icon="emoji"
                size="sm"
                iconSize={20}
                aria-expanded={tool === "emoji"}
                onClick={(event) => activateTool("emoji", event)}
                disabled={!hydrated || sending}
              />
            </span>
            <span {...hoverTool("mention", disabled || !!editingId)}>
              <IconButton
                label="Упомянуть участника"
                icon="mention"
                size="sm"
                iconSize={20}
                disabled={!hydrated || sending || !!editingId}
                aria-expanded={tool === "mention"}
                onClick={(event) => activateTool("mention", event)}
              />
            </span>
            <span {...hoverTool("ticket", disabled || !!editingId)}>
              <IconButton
                label="Заявка"
                icon="hash"
                size="sm"
                iconSize={20}
                disabled={!hydrated || sending || !!editingId}
                aria-expanded={tool === "ticket"}
                onClick={(event) => activateTool("ticket", event)}
              />
            </span>
          </div>
        </div>
      </VoiceRecorder>
      {tool === "emoji" ? (
        <div
          className={styles.emojiPicker}
          role="group"
          aria-label="Выбрать эмодзи"
          {...popupHover}
        >
          {["😊", "👍", "❤️", "🎉", "👀", "🤝", "✅", "🔥"].map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                replaceSelection(emoji);
                closeTools();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {tool === "attach" ? (
        <div
          className={styles.filePicker}
          role="group"
          aria-label="Тип вложения"
          {...popupHover}
        >
          {[
            ["Документ", ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"],
            ["Изображение", "image/*"],
            ["Статья", ".md,.txt,.pdf"],
            ["Музыка", "audio/*"],
          ].map(([label, accept]) => (
            <button type="button" key={label} onClick={() => chooseFile(accept)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {tool === "format" ? (
        <div
          className={styles.formatPicker}
          role="group"
          aria-label="Формат текста"
          {...popupHover}
        >
          {formats.map(([label, delimiter]) => (
            <button
              type="button"
              key={label}
              onClick={() => {
                replaceSelection(delimiter, undefined, delimiter, true);
                closeTools();
              }}
            >
              {label}
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
