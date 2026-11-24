import type { CustomIconProps } from "./LogoIcon.js";

/** Compact ITSM resource link — chain node tied to a domain object. */
export function ItsmLinkIcon({
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
          <rect x="3.5" y="3.5" width="8" height="8" rx="2" />
          <rect x="12.5" y="12.5" width="8" height="8" rx="2" />
          <path
            fill="none"
            stroke="var(--dio-surface, #fff)"
            strokeWidth="1.75"
            d="M11 8.5h2.5A2.5 2.5 0 0116 11v2.5"
          />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.75" />
          <rect x="13" y="13" width="7" height="7" rx="1.75" />
          <path d="M11 8.5h2.25A2.25 2.25 0 0115.5 10.75V13" />
        </>
      )}
    </svg>
  );
}
