import { DIODESK_PROVIDER, type components } from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useUiStore } from "../stores/uiStore.js";
import styles from "./MessageTimeline.module.css";

export function TicketCard({
  uuid,
  number,
  conversationId,
}: {
  uuid?: string | null;
  number?: string | null;
  conversationId: string;
}) {
  const { http } = useRuntime();
  const preview = useQuery({
    queryKey: ["ticket-card", conversationId, uuid],
    enabled: !!http && !!uuid,
    queryFn: () => {
      const params = new URLSearchParams({
        provider: DIODESK_PROVIDER,
        resourceType: "ticket",
        resourceId: uuid!,
        conversationId,
      });
      return http!.get<components["schemas"]["ResourcePreviewDTO"]>(
        `/v1/resources/preview?${params}`,
      );
    },
  });

  const data =
    preview.isError || preview.data?.access === "denied" ? undefined : preview.data;
  const name = data?.number || number || "Заявка";
  return (
    <button
      type="button"
      className={styles.ticketCard}
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        useUiStore.getState().setContextResource(name, uuid);
      }}
    >
      <span className={styles.ticketLabel}>
        <Icon name="itsm-link" size={15} /> {name}
      </span>
      {data?.title ? <strong>{data.title}</strong> : null}
      {data?.status ? <span className={styles.ticketLabel}>{data.status}</span> : null}
      {data?.assigneeDisplayName ? (
        <span className={styles.ticketLabel}>{data.assigneeDisplayName}</span>
      ) : null}
      <span className={styles.ticketHint}>Подробнее →</span>
    </button>
  );
}
