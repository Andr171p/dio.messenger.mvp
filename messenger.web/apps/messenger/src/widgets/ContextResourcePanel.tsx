import { Badge, Button, Icon, Spinner } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./ContextResourcePanel.module.css";

interface ResourcePreview {
  title?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  number?: string;
  redacted?: boolean;
}

export function ContextResourcePanel() {
  const resourceId = useUiStore((s) => s.contextResourceId);
  const open = useUiStore((s) => s.contextDrawerOpen);
  const setOpen = useUiStore((s) => s.setContextDrawerOpen);
  const setResource = useUiStore((s) => s.setContextResource);
  const { http } = useRuntime();

  const preview = useQuery({
    queryKey: ["resource-preview", resourceId],
    enabled: !!http && !!resourceId && open,
    queryFn: async () => {
      const params = new URLSearchParams({
        provider: "diodesk",
        resourceType: "ticket",
        resourceId: resourceId!,
      });
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

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Заявка</p>
          <h2>{preview.data?.number ?? preview.data?.title ?? resourceId}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Закрыть панель"
          onClick={() => {
            setOpen(false);
            setResource(null);
          }}
        >
          <Icon name="close" />
        </Button>
      </div>
      {preview.isFetching ? <Spinner size="sm" /> : null}
      {preview.isError ? (
        <p className={styles.note}>Не удалось загрузить preview (проверьте ACL).</p>
      ) : null}
      {preview.data?.redacted ? (
        <Badge tone="warning">Ограниченный доступ</Badge>
      ) : (
        <Badge tone="success">Preview</Badge>
      )}
      <dl className={styles.meta}>
        <dt>Статус</dt>
        <dd>{preview.data?.status ?? "—"}</dd>
        <dt>Приоритет</dt>
        <dd>{preview.data?.priority ?? "—"}</dd>
        <dt>Исполнитель</dt>
        <dd>{preview.data?.assignee ?? "—"}</dd>
      </dl>
      <p className={styles.note}>
        Карточка не расширяет права: данные только из безопасного preview API.
      </p>
    </div>
  );
}