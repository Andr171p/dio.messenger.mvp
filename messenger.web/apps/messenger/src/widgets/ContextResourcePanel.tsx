import { DIODESK_PROVIDER } from "@dio/messenger-core";
import { Badge, Button, Icon, Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ContextResourcePanel.module.css";

interface ResourcePreview {
  number?: string;
  title?: string;
  status?: string;
  priority?: string;
  assigneeDisplayName?: string;
  access?: "full" | "limited" | "denied";
  ref?: { resourceId?: string };
}

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
    queryFn: async () => {
      const params = new URLSearchParams({
        provider: DIODESK_PROVIDER,
        resourceType: "ticket",
        resourceId: apiResourceId!,
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

  const limited = preview.data?.access === "limited" || preview.data?.access === "denied";

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Заявка DIO Desk</p>
          <h2>{preview.data?.number ?? resourceId}</h2>
          {preview.data?.title ? <p className={styles.title}>{preview.data.title}</p> : null}
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
        <p className={styles.note}>Не удалось загрузить preview (проверьте ACL).</p>
      ) : null}
      {limited ? (
        <Badge tone="warning">Ограниченный доступ</Badge>
      ) : preview.data ? (
        <Badge tone="success">Preview</Badge>
      ) : null}
      <dl className={styles.meta}>
        <dt>Статус</dt>
        <dd>{preview.data?.status ?? "—"}</dd>
        <dt>Приоритет</dt>
        <dd>{preview.data?.priority ?? "—"}</dd>
        <dt>Исполнитель</dt>
        <dd>{preview.data?.assigneeDisplayName ?? "—"}</dd>
      </dl>
      <p className={styles.note}>
        Карточка не расширяет права: данные только из безопасного preview API (
        {DIODESK_PROVIDER}).
      </p>
      <Button
        variant="primary"
        className={styles.openDesk}
        onClick={() => {
          const desk = import.meta.env.VITE_DIODESK_WEB_URL ?? "http://localhost:3000";
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
    </div>
  );
}