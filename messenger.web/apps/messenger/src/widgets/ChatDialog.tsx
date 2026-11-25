import { useEffect, useRef, type ReactNode } from "react";
import styles from "./NewChatModal.module.css";

export function ChatDialog({
  title,
  onClose,
  children,
  busy = false,
  onBack,
  variant,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  onBack?: () => void;
  variant?: "chat";
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
      className={[styles.modal, variant === "chat" ? styles.chatModal : ""].join(" ")}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
        {onBack && (
          <button type="button" aria-label="Назад" onClick={onBack}>
            ←
          </button>
        )}
        <h2>{title}</h2>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
