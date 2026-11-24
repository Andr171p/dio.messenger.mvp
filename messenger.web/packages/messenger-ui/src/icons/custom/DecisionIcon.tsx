import type { CustomIconProps } from "./LogoIcon.js";

/** Knowledge / Decisions — bookmark diamond for locked decisions. */
export function DecisionIcon({
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
          <path d="M12 3.5l7 3.2v5.4c0 4.1-2.7 7.7-7 9.4-4.3-1.7-7-5.3-7-9.4V6.7z" />
          <path
            fill="var(--dio-surface, #fff)"
            d="M10.9 13.6l-1.85-1.85 1.06-1.06.79.79 2.85-2.85 1.06 1.06-3.91 3.91z"
          />
        </>
      ) : (
        <>
          <path d="M12 4l6.5 3v5.1c0 3.7-2.45 6.95-6.5 8.4-4.05-1.45-6.5-4.7-6.5-8.4V7z" />
          <path d="M9.25 12.1l1.9 1.9 3.6-3.6" />
        </>
      )}
    </svg>
  );
}
