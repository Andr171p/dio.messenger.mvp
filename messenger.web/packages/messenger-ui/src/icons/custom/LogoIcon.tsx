import type { SVGAttributes } from "react";

export interface CustomIconProps extends SVGAttributes<SVGSVGElement> {
  size?: number | string;
  weight?: string;
  color?: string;
  mirrored?: boolean;
}

/** DIOS mark — kept as brand fill, not Phosphor stroke. */
export function LogoIcon({
  size = 20,
  color = "currentColor",
  className,
  ...rest
}: CustomIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill={color}
      aria-hidden={rest["aria-label"] || rest["aria-labelledby"] ? undefined : true}
      {...rest}
    >
      <path d="M8 4h8c6.6 0 12 5.4 12 12s-5.4 12-12 12H8V4zm4 6v16h4c4.4 0 8-3.6 8-8s-3.6-8-8-8h-4z" />
    </svg>
  );
}
