import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...rest }: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className={[styles.field, className].filter(Boolean).join(" ")} htmlFor={inputId}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input id={inputId} className={styles.input} aria-invalid={!!error || undefined} {...rest} />
      {error ? <span className={styles.error}>{error}</span> : null}
    </label>
  );
}