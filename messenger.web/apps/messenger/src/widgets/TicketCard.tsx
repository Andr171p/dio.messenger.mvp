import { DIODESK_PROVIDER, type components } from "@dio/messenger-core";
import { Icon } from "@dio/messenger-ui";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "../app/providers/RuntimeProvider.js";
import { getDeskTicketUrl } from "../app/runtimeConfig.js";
import { useDirectoryProfiles } from "../features/read/useConversationMembers.js";
import { useUiStore } from "../stores/uiStore.js";
import { TicketPriority, TicketStatus } from "./TicketDetails.js";
import styles from "./TicketCard.module.css";

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
  const ticketNumber = data?.number || number;
  const name = ticketNumber || "Заявка";
  const profile = useDirectoryProfiles(!!data?.assigneeId && !data.assigneeDisplayName);
  const assignee =
    data?.assigneeDisplayName || (data?.assigneeId && profile.data?.[data.assigneeId]);
  const deskUrl =
    data?.access === "full" && ticketNumber ? getDeskTicketUrl(ticketNumber) : undefined;
  const unavailable = preview.isError || preview.data?.access === "denied";

  return (
    <article className={styles.card} aria-label={name}>
      <button
        type="button"
        className={styles.summary}
        aria-label={["Подробнее о заявке", ticketNumber, data?.title]
          .filter(Boolean)
          .join(" · ")}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          useUiStore.getState().setContextResource(name, uuid);
        }}
      >
        <span className={styles.top}>
          <span className={styles.number}>
            <Icon name="itsm-link" size={15} />
            {name}
          </span>
          <span className={styles.status}>
            {data?.status ? <TicketStatus value={data.status} /> : null}
            <Icon name="next" size={13} />
          </span>
        </span>
        {data?.title ? <strong className={styles.title}>{data.title}</strong> : null}
        {data?.description ? (
          <span className={styles.description}>{data.description}</span>
        ) : null}
        <span className={styles.details}>
          <span className={styles.source}>
            DIO Desk{data?.ticketType ? ` · ${data.ticketType}` : ""}
          </span>
          {data?.priority ? <TicketPriority value={data.priority} /> : null}
        </span>
        {assignee ? (
          <span className={styles.assignee}>
            Исполнитель <strong>{assignee}</strong>
          </span>
        ) : null}
        {!data && (unavailable || preview.isFetching) ? (
          <span className={styles.note} role="status">
            {unavailable ? "Заявка недоступна" : "Загрузка заявки…"}
          </span>
        ) : null}
        {data?.access === "limited" ? (
          <span className={styles.note}>Ограниченный доступ</span>
        ) : null}
      </button>
      {deskUrl ? (
        <a
          className={styles.openDesk}
          href={deskUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть в DIO Desk <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </article>
  );
}
