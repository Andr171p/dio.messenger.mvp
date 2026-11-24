import type { CustomIconProps } from "./LogoIcon.js";

/**
 * AI Secretary — spark + soft node, DIOS geometry (not a generic bot face).
 */
export function AiSecretaryIcon({
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
          <circle cx="12" cy="12" r="7.25" />
          <path
            fill="var(--dio-surface, #fff)"
            d="M12 7.6l.95 2.55 2.7.1-2.15 1.7.75 2.6L12 13.3l-2.25 1.25.75-2.6-2.15-1.7 2.7-.1L12 7.6z"
          />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="7.25" />
          <path d="M12 8.25l.85 2.2 2.35.08-1.86 1.45.65 2.25L12 13.05l-1.99 1.18.65-2.25-1.86-1.45 2.35-.08L12 8.25z" />
        </>
      )}
    </svg>
  );
}
