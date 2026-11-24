import { Avatar, type AvatarProps } from "@dio/messenger-ui";
import styles from "./ContextResourcePanel.module.css";

const statuses: Record<string, string> = {
  new: "Новая",
  open: "Открыта",
  in_progress: "В работе",
  pending_approval: "На согласовании",
  waiting: "Ожидание",
  paused: "Приостановлена",
  resolved: "Решена",
  closed: "Закрыта",
  reopened: "Переоткрыта",
  rejected: "Отклонена",
  canceled: "Отменена",
};
const priorities: Record<string, string> = {
  critical: "P1 · Критический",
  high: "P2 · Высокий",
  medium: "P3 · Средний",
  low: "P4 · Низкий",
};

export function TicketStatus({ value }: { value: string }) {
  return value ? (
    <span className={styles.statusPill}>{statuses[value] ?? value}</span>
  ) : null;
}

export function TicketPriority({ value }: { value: string }) {
  return value ? (
    <span className={styles.priorityPill}>{priorities[value] ?? value}</span>
  ) : null;
}

export function TicketAssignee({
  name,
  size = "sm",
}: {
  name: string;
  size?: AvatarProps["size"];
}) {
  return (
    <span className={styles.assignee}>
      <Avatar name={name} size={size} />
      <span>
        <small>Исполнитель</small>
        <strong>{name}</strong>
      </span>
    </span>
  );
}
