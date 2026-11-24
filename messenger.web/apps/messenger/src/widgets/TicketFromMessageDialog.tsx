import type { components } from "@dio/messenger-core";
import { Button, Input } from "@dio/messenger-ui";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ForwardModal.module.css";

export function TicketFromMessageDialog({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: string;
  messageId: string;
  onClose: () => void;
}) {
  const { http, sync } = useRuntime();
  const dialog = useRef<HTMLDialogElement>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/v1/conversations/${conversationId}/messages/${messageId}/ticket-suggestion`;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!http) return;
    let current = true;
    void http
      .get<components["schemas"]["TicketSuggestionDTO"]>(endpoint)
      .then((suggestion) => {
        if (!current) return;
        setTitle(suggestion.title ?? "");
        setDescription(suggestion.description ?? "");
        setReady(suggestion.suggested);
        if (!suggestion.suggested)
          setError("Для этого сообщения создание заявки недоступно");
      })
      .catch(() => {
        if (current) setError("Не удалось подготовить заявку");
      });
    return () => {
      current = false;
    };
  }, [endpoint, http]);

  return (
    <dialog
      ref={dialog}
      className={styles.nativeDialog}
      aria-label="Создать заявку"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!http || pending || !ready) return;
          setPending(true);
          setError("");
          void http
            .post<components["schemas"]["CreateTicketFromChatResultDTO"]>(
              `${endpoint}/confirm`,
              {
                title: title.trim(),
                description: description.trim(),
                clientRequestId: requestId,
              },
            )
            .then((ticket) => {
              void sync?.synchronize().catch(() => undefined);
              if (useUiStore.getState().selectedConversationId === conversationId) {
                useUiStore
                  .getState()
                  .setContextResource(ticket.number, ticket.ticketId);
              }
              onClose();
            })
            .catch(() =>
              setError("Не удалось создать заявку. Можно повторить попытку."),
            )
            .finally(() => setPending(false));
        }}
      >
        <h2>Создать заявку</h2>
        {ready ? (
          <>
            <Input
              label="Название"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              required
            />
            <label>
              Описание
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={10_000}
                required
              />
            </label>
          </>
        ) : !error ? (
          <p role="status">Подготавливаем заявку…</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!ready || !title.trim() || !description.trim() || pending}
          >
            Создать
          </Button>
        </div>
      </form>
    </dialog>
  );
}
