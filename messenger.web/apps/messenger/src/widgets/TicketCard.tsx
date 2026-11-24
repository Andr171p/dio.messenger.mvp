import { DIODESK_PROVIDER, type components } from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { useDirectoryProfiles } from "../features/read/useConversationMembers.js";
import { useUiStore } from "../stores/uiStore.js";
import { TicketAssignee, TicketStatus } from "./TicketDetails.js";
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
    queryKey: ["ticket-card", conversationId, uuid ?? number],
    enabled: !!http && !!uuid,
    staleTime: 30_000,
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
  const profile = useDirectoryProfiles(!!data?.assigneeId && !data.assigneeDisplayName);
  const assignee =
    data?.assigneeDisplayName || (data?.assigneeId && profile.data?.[data.assigneeId]);
  return (
    <button
      type="button"
      className={styles.ticketCard}
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        useUiStore.getState().setContextResource(name, uuid);
      }}
    >
      <span className={styles.ticketTop}>
        <span className={styles.ticketLabel}>
          <Icon name="itsm-link" size={15} /> {name}
        </span>
        {data?.status ? <TicketStatus value={data.status} /> : null}
      </span>
      {data?.title ? (
        <strong className={styles.ticketTitle}>{data.title}</strong>
      ) : null}
      {!data && preview.isFetching ? (
        <span className={styles.ticketTitle}>Загрузка заявки…</span>
      ) : null}
      {!data && (preview.isError || preview.data?.access === "denied") ? (
        <span className={styles.ticketTitle}>Заявка недоступна</span>
      ) : null}
      {assignee ? <TicketAssignee name={assignee} /> : null}
      <span className={styles.ticketHint}>
        Подробнее <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}
