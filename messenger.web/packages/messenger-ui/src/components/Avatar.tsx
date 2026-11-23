import styles from "./Avatar.module.css";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({ name, src, size = "md" }: AvatarProps) {
  return (
    <span className={[styles.root, styles[size]].join(" ")} title={name} aria-label={name}>
      {src ? <img className={styles.img} src={src} alt="" /> : initials(name)}
    </span>
  );
}