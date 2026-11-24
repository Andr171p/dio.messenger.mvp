import { DIODESK_PROVIDER, type components } from "@dio/messenger-core";
import { Badge, Button, Icon, Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { getRuntimeConfig } from "../app/runtimeConfig.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ContextResourcePanel.module.css";

type ResourcePreview = components["schemas"]["ResourcePreviewDTO"];

export function ContextResourcePanel() {
  const resourceId = useUiStore((s) => s.contextResourceId);
  const resourceUuid = useUiStore((s) => s.contextResourceUuid);
  const conversationId = useUiStore((s) => s.selectedConversationId);
  const open = useUiStore((s) => s.contextDrawerOpen);
  const setOpen = useUiStore((s) => s.setContextDrawerOpen);
  const setResource = useUiStore((s) => s.setContextResource);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const { http } = useRuntime();

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

  if (!open || !resourceId) {
    return (
      <div className={styles.placeholder}>
        <p>Выберите ссылку на заявку (#INC-…), чтобы открыть контекст DIO Desk.</p>
      </div>
    );
  }

  const denied = preview.data?.access === "denied";
  const limited = preview.data?.access === "limited";
  const visible = !!preview.data && !denied && !preview.isError && !preview.isFetching;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Заявка DIO Desk</p>
          <h2>{visible ? (preview.data?.number ?? resourceId) : resourceId}</h2>
          {visible && preview.data?.title ? (
            <p className={styles.title}>{preview.data.title}</p>
          ) : null}
        </div>
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
      {preview.isFetching ? <Spinner size="sm" /> : null}
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
      {visible ? (
        <>
          <dl className={styles.meta}>
            <dt>Статус</dt>
            <dd>{preview.data?.status ?? "—"}</dd>
            <dt>Приоритет</dt>
            <dd>{preview.data?.priority ?? "—"}</dd>
            <dt>Исполнитель</dt>
            <dd>{preview.data?.assigneeDisplayName ?? "—"}</dd>
          </dl>
          {preview.data?.updatedAt ? (
            <p className={styles.note}>
              Обновлено {new Date(preview.data.updatedAt).toLocaleString("ru-RU")}
            </p>
          ) : null}
          {preview.data?.description ? (
            <section>
              <h3>Описание</h3>
              <p className={styles.description}>{preview.data.description}</p>
            </section>
          ) : null}
          {preview.data?.attachments ? (
            <section>
              <h3>Вложения</h3>
              {preview.data.attachments.length ? (
                <ul>
                  {preview.data.attachments.map((item, index) => (
                    <li key={index}>
                      {item.filename} · {Math.max(1, Math.round(item.size / 1024))} КБ
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Вложений пока нет</p>
              )}
            </section>
          ) : null}
          {preview.data?.activity ? (
            <section>
              <h3>Активность</h3>
              {preview.data.activity.length ? (
                <ul>
                  {preview.data.activity.map((item, index) => (
                    <li key={index}>
                      {item.action} ·{" "}
                      {new Date(item.occurredAt).toLocaleString("ru-RU")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.note}>Событий пока нет</p>
              )}
            </section>
          ) : null}
          <Button
            variant="primary"
            className={styles.openDesk}
            onClick={() => {
              const desk = getRuntimeConfig().deskWeb;
              const id = preview.data?.ref?.resourceId ?? apiResourceId;
              const number = preview.data?.number ?? resourceId;
              window.open(
                `${desk.replace(/\/$/, "")}/tickets/${encodeURIComponent(String(id ?? number))}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            Открыть в DIO Desk
          </Button>
        </>
      ) : null}
    </div>
  );
}
