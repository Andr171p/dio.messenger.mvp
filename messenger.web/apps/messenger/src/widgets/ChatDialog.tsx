import { useEffect, useRef, type ReactNode } from "react";
import styles from "./NewChatModal.module.css";

export function ChatDialog({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className={styles.dialogHead}>
        <h2>{title}</h2>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
