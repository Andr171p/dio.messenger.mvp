import styles from "./Spinner.module.css";

export interface SpinnerProps {
  label?: string;
  size?: "sm" | "md";
}

export function Spinner({ label = "Loading", size = "md" }: SpinnerProps) {
  return (
    <span
      className={[styles.root, styles[size]].join(" ")}
      role="status"
      aria-live="polite"
      aria-label={label}
    />
  );
}