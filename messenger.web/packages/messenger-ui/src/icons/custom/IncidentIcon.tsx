import type { CustomIconProps } from "./LogoIcon.js";

/**
 * Linked incident / work object — ticket plate with status tick.
 * Geometry aligned to Phosphor 24×24 optical weight.
 */
export function IncidentIcon({
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
          <path d="M5 4.5h10.5L19 8v11.5a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19.5v-13A1.5 1.5 0 015 4.5z" />
          <path
            fill="var(--dio-surface, #fff)"
            d="M9.2 14.3l-1.9-1.9 1.06-1.06 0.84 0.84 3.3-3.3 1.06 1.06-4.36 4.36z"
          />
        </>
      ) : (
        <>
          <path d="M14.5 4.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5h12a1.5 1.5 0 001.5-1.5V9.5z" />
          <path d="M14.5 4.5V9.5H19.5" />
          <path d="M8.5 13.5l2 2 4.5-4.5" />
        </>
      )}
    </svg>
  );
}
