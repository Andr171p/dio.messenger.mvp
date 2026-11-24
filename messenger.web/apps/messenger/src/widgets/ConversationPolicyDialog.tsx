import { HttpError, type components } from "@dio/messenger-core";
import { Button } from "@dio/messenger-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useDirectoryProfiles } from "../features/read/useConversationMembers.js";
import {
  policyKey,
  useConversationPolicy,
  type ConversationPolicy,
} from "../features/conversation/useConversationPolicy.js";
import styles from "./ForwardModal.module.css";

const options = [
  ["allowExternalMembers", "Внешние участники"],
  ["allowForwarding", "Пересылка сообщений"],
  ["allowAttachments", "Вложения"],
] as const;

const actionLabels: Record<string, string> = {
  "member.added": "Добавлен участник",
  "member.removed": "Удалён участник",
  "conversation.policy.updated": "Изменены настройки беседы",
  "message.forwarded": "Переслано сообщение",
  "message.pinned": "Закреплено сообщение",
  "message.unpinned": "Откреплено сообщение",
  "context_link.created": "Привязана заявка",
  "context_link.deleted": "Удалена привязка заявки",
};

export function ConversationPolicyDialog({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { http } = useRuntime();
  const client = useQueryClient();
  const policy = useConversationPolicy(conversationId);
  const [draft, setDraft] = useState<Partial<ConversationPolicy>>({});
  const [auditOpen, setAuditOpen] = useState(false);
  const profiles = useDirectoryProfiles(auditOpen);
  const audit = useQuery({
    queryKey: ["conversation-audit", conversationId],
    enabled: !!http && auditOpen,
    retry: false,
    queryFn: () =>
      http!.get<components["schemas"]["AuditEventDTO"][]>(
        `/v1/audit?conversationId=${conversationId}&limit=25`,
      ),
  });
  const save = useMutation({
    mutationFn: () =>
      http!.request<ConversationPolicy>(`/v1/conversations/${conversationId}/policy`, {
        method: "PATCH",
        json: draft,
      }),
    onSuccess: (updated) => {
      client.setQueryData(policyKey(conversationId), updated);
      setDraft({});
      void client.invalidateQueries({
        queryKey: ["conversation-audit", conversationId],
      });
    },
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.nativeDialog}
      aria-labelledby="policy-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!save.isPending) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h2 id="policy-title">Настройки беседы</h2>
        {policy.isError ? <p role="alert">Не удалось загрузить настройки</p> : null}
        {policy.isPending ? <p role="status">Загрузка настроек…</p> : null}
        {policy.data ? (
          <fieldset disabled={save.isPending}>
            <legend>Правила беседы</legend>
            {options.map(([key, label]) => (
              <label key={key}>
                <span>
                  <input
                    type="checkbox"
                    checked={draft[key] ?? policy.data[key]}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: event.target.checked })
                    }
                  />{" "}
                  {label}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {save.isError ? <p role="alert">Не удалось сохранить настройки</p> : null}
        <details onToggle={(event) => setAuditOpen(event.currentTarget.open)}>
          <summary>Журнал действий</summary>
          {audit.isFetching ? <p role="status">Загрузка журнала…</p> : null}
          {audit.isError ? (
            <p role="alert">
              {audit.error instanceof HttpError && audit.error.status === 403
                ? "Журнал недоступен для вашей роли"
                : "Не удалось загрузить журнал"}
            </p>
          ) : null}
          {audit.data?.length ? (
            <ul>
              {audit.data.map((entry) => (
                <li key={entry.id}>
                  <strong>{actionLabels[entry.action] ?? "Действие в беседе"}</strong>
                  {" · "}
                  {profiles.data?.[entry.actorId] ?? "Участник"}
                  {" · "}
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString("ru-RU")}
                  </time>
                </li>
              ))}
            </ul>
          ) : audit.isSuccess ? (
            <p>Журнал пока пуст</p>
          ) : null}
        </details>
        <div className={styles.dialogActions}>
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={onClose}
          >
            Закрыть
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!policy.data || !Object.keys(draft).length || save.isPending}
          >
            Сохранить
          </Button>
        </div>
      </form>
    </dialog>
  );
}
