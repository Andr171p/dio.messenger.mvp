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
  | "check-double"
  | "sun"
  | "moon"
  | "pin";

/** Clean Lucide-style strokes (24×24 viewBox). */
const paths: Record<Exclude<IconName, "logo">, string | string[]> = {
  chat: [
    "M7.9 20A9 9 0 104 16.1L2 22z",
  ],
  people: [
    "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2",
    "M9 11a4 4 0 100-8 4 4 0 000 8z",
    "M22 21v-2a4 4 0 00-3-3.87",
    "M16 3.13a4 4 0 010 7.75",
  ],
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z",
  settings: [
    "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z",
    "M12 15a3 3 0 100-6 3 3 0 000 6z",
  ],
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.3-4.3"],
  send: "M14.5 21.5L21 3 2.5 10.5l7.5 2.5L14.5 21.5z",
  attach: "M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48",
  mention: [
    "M12 12a4 4 0 100-8 4 4 0 000 8z",
    "M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94",
  ],
  hash: ["M4 9h16", "M4 15h16", "M10 3L8 21", "M16 3l-2 18"],
  emoji: [
    "M12 22a10 10 0 100-20 10 10 0 000 20z",
    "M8 14s1.5 2 4 2 4-2 4-2",
    "M9 9h.01",
    "M15 9h.01",
  ],
  reply: ["M9 17l-5-5 5-5", "M20 18v-2a4 4 0 00-4-4H4"],
  more: ["M12 12h.01", "M19 12h.01", "M5 12h.01"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"],
  close: ["M18 6L6 18", "M6 6l12 12"],
  offline: ["M2 12h4l3-9 4 18 3-9h4"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  pencil: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"],
  check: "M20 6L9 17l-5-5",
  "check-double": ["M18 6L7 17l-5-5", "M22 10l-7.5 7.5L13 16"],
  sun: [
    "M12 12a4 4 0 100-8 4 4 0 000 8z",
    "M12 2v2",
    "M12 20v2",
    "M4.93 4.93l1.41 1.41",
    "M17.66 17.66l1.41 1.41",
    "M2 12h2",
    "M20 12h2",
    "M6.34 17.66l-1.41 1.41",
    "M19.07 4.93l-1.41 1.41",
  ],
  moon: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  pin: "M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6a1 1 0 00-1-1h-4a1 1 0 00-1 1z",
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
