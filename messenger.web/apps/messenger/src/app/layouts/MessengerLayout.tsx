import type { ReactNode } from "react";
import type { MobilePane } from "../../stores/uiStore.js";
import styles from "./MessengerLayout.module.css";

export interface MessengerLayoutProps {
  rail: ReactNode;
  list: ReactNode;
  chat: ReactNode;
  context: ReactNode;
  contextOpen?: boolean;
  mobilePane?: MobilePane;
}

export function MessengerLayout({
  rail,
  list,
  chat,
  context,
  contextOpen,
  mobilePane = "list",
}: MessengerLayoutProps) {
  return (
    <div
      className={[
        styles.shell,
        contextOpen ? styles.contextOpen : styles.contextCollapsed,
        styles[`mobile_${mobilePane}`],
      ].join(" ")}
    >
      <aside className={styles.rail} aria-label="Навигация">
        {rail}
      </aside>
      <section className={styles.listPane} aria-hidden={mobilePane !== "list" ? true : undefined}>
        {list}
      </section>
      <main className={styles.chatPane} aria-hidden={mobilePane !== "chat" ? true : undefined}>
        {chat}
      </main>
      <aside
        className={styles.contextPane}
        aria-label="Контекст заявки"
        hidden={!contextOpen && mobilePane !== "context"}
        aria-hidden={mobilePane !== "context" && contextOpen ? true : undefined}
      >
        {context}
      </aside>
    </div>
  );
}
