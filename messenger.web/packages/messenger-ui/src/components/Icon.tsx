import type { ReactNode, SVGAttributes } from "react";
import styles from "./Icon.module.css";

export type IconName =
  | "logo"
  | "chat"
  | "people"
  | "bookmark"
  | "settings"
  | "search"
  | "send"
  | "attach"
  | "mention"
  | "hash"
  | "emoji"
  | "reply"
  | "more"
  | "edit"
  | "close"
  | "offline"
  | "menu"
  | "pencil"
  | "check"
  | "check-double";

const paths: Record<Exclude<IconName, "logo">, string | string[]> = {
  chat: "M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z",
  people:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm12 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z",
  settings:
    "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm7.94-2.06a1 1 0 00.24-1.1l-1.1-1.9a1 1 0 00-.96-.48h-.12a7.03 7.03 0 00-.63-1.08l.06-.13a1 1 0 00-.12-.97l-1.65-1.65a1 1 0 00-.97-.12l-.13.06a7.03 7.03 0 00-1.08-.63v-.12a1 1 0 00-.48-.96l-1.9-1.1a1 1 0 00-1.1.24l-.13.11a7.08 7.08 0 00-1.54 0l-.13-.11a1 1 0 00-1.1-.24l-1.9 1.1a1 1 0 00-.48.96v.12a7.03 7.03 0 00-1.08.63l-.13-.06a1 1 0 00-.97.12L4.52 8.4a1 1 0 00-.12.97l.06.13a7.03 7.03 0 00-.63 1.08h-.12a1 1 0 00-.96.48l-1.1 1.9a1 1 0 00.24 1.1l.11.13a7.08 7.08 0 000 1.54l-.11.13a1 1 0 00-.24 1.1l1.1 1.9a1 1 0 00.96.48h.12a7.03 7.03 0 00.63 1.08l-.06.13a1 1 0 00.12.97l1.65 1.65a1 1 0 00.97.12l.13-.06a7.03 7.03 0 001.08.63v.12a1 1 0 00.48.96l1.9 1.1a1 1 0 001.1-.24l.13-.11a7.08 7.08 0 001.54 0l.13.11a1 1 0 001.1.24l1.9-1.1a1 1 0 00.48-.96v-.12a7.03 7.03 0 001.08-.63l.13.06a1 1 0 00.97-.12l1.65-1.65a1 1 0 00.12-.97l-.06-.13a7.03 7.03 0 00.63-1.08h.12a1 1 0 00.96-.48l1.1-1.9a1 1 0 00-.24-1.1l-.11-.13a7.08 7.08 0 000-1.54l.11-.13z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  attach:
    "M16.5 6.5l-9 9a3 3 0 104.24 4.24l9.5-9.5a5 5 0 10-7.07-7.07l-10 10",
  mention: "M16 8a5 5 0 015 5v1a3 3 0 01-6 0v-1m0 0V9a3 3 0 116 0v5a7 7 0 01-14 0v-1",
  hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
  emoji: "M12 21a9 9 0 100-18 9 9 0 000 18zm-4-7h.01M16 14h.01",
  reply: "M9 17l-5-5 5-5M4 12h11a4 4 0 014 4v1",
  more: "M12 12h.01M19 12h.01M5 12h.01",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  close: "M6 6l12 12M18 6L6 18",
  offline: "M3 12h4l3-8 4 16 3-8h4",
  menu: "M4 7h16M4 12h16M4 17h16",
  pencil:
    "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  check: "M5 13l4 4L19 7",
  "check-double": "M5 13l2 2 2-2M11 17l2 2 10-10",
};

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
  title?: string;
}

function renderPaths(name: Exclude<IconName, "logo">): ReactNode {
  const value = paths[name];
  if (Array.isArray(value)) {
    return value.map((d) => <path key={d} d={d} />);
  }
  return <path d={value} />;
}

export function Icon({ name, size = 20, title, className, ...rest }: IconProps) {
  if (name === "logo") {
    return (
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className={[styles.root, styles.logo, className].filter(Boolean).join(" ")}
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <path
          fill="currentColor"
          d="M8 4h8c6.6 0 12 5.4 12 12s-5.4 12-12 12H8V4zm4 6v16h4c4.4 0 8-3.6 8-8s-3.6-8-8-8h-4z"
        />
        <path
          fill="currentColor"
          d="M6 26c0-1.1.9-2 2-2h2v4H8c-1.1 0-2-.9-2-2z"
          opacity="0.85"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={[styles.root, className].filter(Boolean).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {renderPaths(name)}
    </svg>
  );
}