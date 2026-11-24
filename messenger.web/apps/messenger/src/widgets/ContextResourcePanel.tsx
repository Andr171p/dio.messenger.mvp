import { DIODESK_PROVIDER, type components } from "@dio/messenger-core";
import { Badge, Button, Icon, Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { getRuntimeConfig } from "../app/runtimeConfig.js";
import { useDirectoryProfiles } from "../features/read/useConversationMembers.js";
import { useUiStore } from "../stores/uiStore.js";
import { TicketAssignee, TicketPriority, TicketStatus } from "./TicketDetails.js";
import styles from "./ContextResourcePanel.module.css";

type ResourcePreview = components["schemas"]["ResourcePreviewDTO"];

const activityLabels: Record<string, string> = {
  created: "Создана заявка",
  updated: "Заявка обновлена",
  edited: "Заявка обновлена",
  assigned: "Назначен исполнитель",
  status_changed: "Изменён статус",
  priority_changed: "Изменён приоритет",
  approval_submitted: "Отправлена на согласование",
  approved: "Заявка согласована",
  paused: "Заявка приостановлена",
  resolved: "Заявка решена",
  closed: "Заявка закрыта",
  reopened: "Заявка переоткрыта",
  canceled: "Заявка отменена",
  archived: "Заявка архивирована",
  comment_added: "Добавлен комментарий",
  attachment_added: "Добавлено вложение",
};

export function ContextResourcePanel() {
  const resourceId = useUiStore((s) => s.contextResourceId);
  const resourceUuid = useUiStore((s) => s.contextResourceUuid);
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const open = useUiStore((s) => s.contextDrawerOpen);
  const setOpen = useUiStore((s) => s.setContextDrawerOpen);
  const setResource = useUiStore((s) => s.setContextResource);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const { http } = useRuntime();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const apiResourceId = resourceUuid ?? resourceId;

  const preview = useQuery({
    queryKey: ["resource-preview", apiResourceId, conversationId],
    enabled: !!http && !!apiResourceId && !!open,
    refetchOnMount: "always",
    queryFn: async () => {
      let id = resourceUuid ?? undefined;
      if (!id && conversationId && resourceId) {
        const lookup = new URLSearchParams({ conversationId, q: resourceId });
        const matches = await http!.get<ResourcePreview[]>(
          `/v1/resources/tickets/search?${lookup}`,
        );
        id = matches.find(
          (row) => row.number.toLowerCase() === resourceId.toLowerCase(),
        )?.ref.resourceId;
      }
      if (!id) throw new Error("Заявка недоступна");
      const params = new URLSearchParams({
        provider: DIODESK_PROVIDER,
        resourceType: "ticket",
        resourceId: id,
        includeActivity: "true",
      });
      if (conversationId) params.set("conversationId", conversationId);
      return http!.get<ResourcePreview>(`/v1/resources/preview?${params}`);
    },
  });
  const data =
    !preview.isError && preview.data?.access !== "denied" ? preview.data : undefined;
  const profiles = useDirectoryProfiles(
    !!data?.assigneeId && !data.assigneeDisplayName,
  );
  const assignee =
    data?.assigneeDisplayName || (data?.assigneeId && profiles.data?.[data.assigneeId]);

  async function openAttachment(attachmentId: string) {
    if (!data || !http || !conversationId) return;
    setAttachmentError(null);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const params = new URLSearchParams({ conversationId });
      const urlPath =
        "/v1/resources/tickets/" +
        encodeURIComponent(data.ref.resourceId) +
        "/attachments/" +
        encodeURIComponent(attachmentId) +
        "/access?" +
        params;
      const access =
        await http.get<components["schemas"]["ResourceAttachmentAccessDTO"]>(urlPath);
      const url = new URL(access.url);
      if (
        url.protocol !== "https:" &&
        !(url.protocol === "http:" && import.meta.env.DEV)
      )
        throw new Error("Invalid URL");
      if (tab) tab.location.replace(url.href);
      else window.location.assign(url.href);
    } catch {
      tab?.close();
      setAttachmentError(data.ref.resourceId);
    }
  }

  if (!open || !resourceId) {
    return (
      <div className={styles.placeholder}>
        <p>Выберите ссылку на заявку (#INC-…), чтобы открыть контекст DIO Desk.</p>
      </div>
    );
  }

  const denied = preview.data?.access === "denied";
  const limited = preview.data?.access === "limited";
  const visible = !!data;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>Заявка</p>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Закрыть панель"
          onClick={() => {
            setOpen(false);
            setResource(null);
            setMobilePane("chat");
          }}
        >
          <Icon name="close" />
        </Button>
      </div>
      {preview.isFetching && !data ? <Spinner size="sm" /> : null}
      {preview.isError ? (
        <p role="alert" className={styles.note}>
          Не удалось открыть заявку.{" "}
          <button type="button" onClick={() => void preview.refetch()}>
            Повторить
          </button>
        </p>
      ) : null}
      {denied ? (
        <Badge tone="warning">Заявка недоступна</Badge>
      ) : visible && limited ? (
        <Badge tone="warning">Ограниченный доступ</Badge>
      ) : null}
      {data ? (
        <>
          <div className={styles.summary}>
            <span className={styles.number}>
              <Icon name="itsm-link" size={15} /> {data.number || resourceId}
            </span>
            <h2>{data.title || data.number}</h2>
            <div className={styles.pills}>
              <TicketStatus value={data.status} />
              <TicketPriority value={data.priority} />
            </div>
            {assignee ? (
              <div className={styles.tile}>
                <TicketAssignee name={assignee} size="md" />
              </div>
            ) : null}
          </div>
          {data.description ? (
            <section>
              <h3>Описание</h3>
              <p className={styles.description}>{data.description}</p>
            </section>
          ) : null}
          {data.attachments ? (
            <section>
              <h3>
                Вложения <span className={styles.count}>{data.attachments.length}</span>
              </h3>
              {data.attachments.length ? (
                <ul className={styles.attachments}>
                  {data.attachments.map((item, index) => (
                    <li key={item.id ?? index}>
                      <button
                        type="button"
                        className={styles.attachment}
                        disabled={!item.id}
                        onClick={() => item.id && void openAttachment(item.id)}
                      >
                        <span className={styles.fileIcon}>
                          <Icon name="attach" size={17} />
                        </span>
                        <span className={styles.fileInfo}>
                          <strong>{item.filename}</strong>
                          <small>
                            {item.contentType.startsWith("image/")
                              ? "Изображение"
                              : item.contentType.startsWith("text/")
                                ? "Текстовый файл"
                                : "Файл"}{" "}
                            ·{" "}
                            {item.size < 1024
                              ? item.size + " Б"
                              : Math.round(item.size / 1024) + " КБ"}
                          </small>
                        </span>
                        {item.id ? <span aria-hidden="true">↗</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Вложений пока нет</p>
              )}
              {attachmentError === data.ref.resourceId ? (
                <p className={styles.note} role="alert">
                  Не удалось открыть вложение
                </p>
              ) : null}
            </section>
          ) : null}
          {data.activity ? (
            <section>
              <h3>Активность</h3>
              {data.activity.length ? (
                <ul className={styles.activity}>
                  {data.activity.map((item, index) => (
                    <li key={index}>
                      <span>
                        {activityLabels[item.action.replace(/^ticket\./, "")] ??
                          item.action}
                      </span>
                      <time
                        dateTime={item.occurredAt}
                        title={new Date(item.occurredAt).toLocaleString("ru-RU")}
                      >
                        {new Date(item.occurredAt).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        {new Date(item.occurredAt).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Событий пока нет</p>
              )}
            </section>
          ) : null}
          <Button
            variant="ghost"
            className={styles.openDesk}
            onClick={() => {
              const desk = getRuntimeConfig().deskWeb;
              const number = data.number || resourceId;
              window.open(
                `${desk.replace(/\/$/, "")}/tickets/${encodeURIComponent(number)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            Открыть в DIO Desk <span aria-hidden="true">↗</span>
          </Button>
        </>
      ) : null}
    </div>
  );
}
