import type { ReactNode } from "react";
import styles from "./MessengerLayout.module.css";

export interface MessengerLayoutProps {
  rail: ReactNode;
  list: ReactNode;
  chat: ReactNode;
  context: ReactNode;
  statusBar?: ReactNode;
  contextOpen?: boolean;
}

export function MessengerLayout({
  rail,
  list,
  chat,
  context,
  statusBar,
  contextOpen,
}: MessengerLayoutProps) {
  return (
    <div
      className={[
        styles.shell,
        contextOpen ? styles.contextOpen : styles.contextCollapsed,
      ].join(" ")}
    >
      <aside className={styles.rail} aria-label="Навигация">
        {rail}
      </aside>
      <section className={styles.listPane}>{list}</section>
      <main className={styles.chatPane}>{chat}</main>
      <aside
        className={styles.contextPane}
        aria-label="Контекст заявки"
        hidden={!contextOpen}
      >
        {context}
      </aside>
      {statusBar ? <footer className={styles.statusBar}>{statusBar}</footer> : null}
    </div>
  );
}