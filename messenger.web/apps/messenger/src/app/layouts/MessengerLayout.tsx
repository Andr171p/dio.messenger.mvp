import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { MobilePane } from "../../stores/uiStore.js";
import styles from "./MessengerLayout.module.css";

export interface MessengerLayoutProps {
  rail: ReactNode;
  list: ReactNode;
  chat: ReactNode;
  context: ReactNode;
  contextOpen?: boolean;
  onCloseContext: () => void;
  mobilePane?: MobilePane;
}

const drawerMedia = "(width < 900px)";

function subscribeDrawer(listener: () => void) {
  const query = matchMedia(drawerMedia);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function MessengerLayout({
  rail,
  list,
  chat,
  context,
  contextOpen,
  onCloseContext,
  mobilePane = "list",
}: MessengerLayoutProps) {
  const drawer = useSyncExternalStore(
    subscribeDrawer,
    () => matchMedia(drawerMedia).matches,
  );
  const modal = !!contextOpen && drawer;
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!contextOpen) return;
    return () => {
      const opener = trigger.current;
      requestAnimationFrame(() => opener?.focus());
    };
  }, [contextOpen]);

  useEffect(() => {
    if (modal) panel.current?.focus();
  }, [modal]);

  return (
    <div
      onFocusCapture={(event) => {
        if (!contextOpen) trigger.current = event.target as HTMLElement;
      }}
      className={[
        styles.shell,
        contextOpen ? styles.contextOpen : "",
        styles[`mobile_${mobilePane}`],
      ].join(" ")}
    >
      <aside className={styles.rail} aria-label="Навигация" inert={modal}>
        {rail}
      </aside>
      <section className={styles.listPane} inert={modal}>
        {list}
      </section>
      <main className={styles.chatPane} inert={modal}>
        {chat}
      </main>
      {modal ? (
        <div className={styles.backdrop} onClick={onCloseContext} aria-hidden="true" />
      ) : null}
      <aside
        ref={panel}
        className={styles.contextPane}
        aria-label="Контекст заявки"
        hidden={!contextOpen}
        tabIndex={-1}
        role={modal ? "dialog" : undefined}
        aria-modal={modal || undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCloseContext();
          }
          if (!modal || event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), a[href], input:not(:disabled), [tabindex='0']",
            ),
          ).filter((control) => control.getClientRects().length > 0);
          const first = controls[0];
          const last = controls.at(-1);
          if (
            !first ||
            document.activeElement === panel.current ||
            document.activeElement === (event.shiftKey ? first : last)
          ) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
      >
        {context}
      </aside>
    </div>
  );
}
