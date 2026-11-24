import type { CustomIconProps } from "./LogoIcon.js";

/**
 * External participants / perimeter — chat bubble with outbound arrow.
 */
export function ExternalChatIcon({
  size = 20,
  color = "currentColor",
  weight = "regular",
  className,
  ...rest
}: CustomIconProps) {
  const stroke = weight === "fill" ? 0 : weight === "bold" ? 2 : 1.75;
  const filled = weight === "fill";

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? color : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rest["aria-label"] || rest["aria-labelledby"] ? undefined : true}
      {...rest}
    >
      {filled ? (
        <>
          <path d="M4.5 6.5A2.5 2.5 0 017 4h7.5a2.5 2.5 0 012.5 2.5v6A2.5 2.5 0 0114.5 15H10l-3.5 3v-3H7A2.5 2.5 0 014.5 12.5z" />
          <path
            fill="none"
            stroke="var(--dio-surface, #fff)"
            strokeWidth="1.75"
            d="M14.5 8.25h4.25M16.5 6.5l2.25 1.75-2.25 1.75"
          />
        </>
      ) : (
        <>
          <path d="M5 6.5A2 2 0 017 4.5h7a2 2 0 012 2v5.5a2 2 0 01-2 2h-4.2L7 17.5v-3H7a2 2 0 01-2-2z" />
          <path d="M14.75 8.5h4M16.75 6.75L19 8.5l-2.25 1.75" />
        </>
      )}
    </svg>
  );
}
