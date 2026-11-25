import { useState } from "react";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({ name, src, size = "md", online }: AvatarProps) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      className={[styles.root, styles[size], online ? styles.online : ""]
        .filter(Boolean)
        .join(" ")}
      title={name}
      aria-label={name}
    >
      {src && src !== failed ? (
        <img className={styles.img} src={src} onError={() => setFailed(src)} alt="" />
      ) : (
        initials(name)
      )}
      {online ? <span className={styles.dot} aria-hidden /> : null}
    </span>
  );
}
