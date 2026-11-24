import type { SVGAttributes } from "react";
import { icons, type IconContext, type IconName, ICON_CONTEXT_SIZE } from "./iconRegistry.js";
import { ICON_SIZES, type IconSizeToken, type IconTone, type IconWeight } from "./types.js";
import styles from "./AppIcon.module.css";

const TONE_CLASS: Record<Exclude<IconTone, "inherit">, string | undefined> = {
  muted: styles.toneMuted,
  default: styles.toneDefault,
  strong: styles.toneStrong,
  active: styles.toneActive,
  danger: styles.toneDanger,
  disabled: styles.toneDisabled,
};

export interface AppIconProps extends Omit<SVGAttributes<SVGSVGElement>, "name" | "children"> {
  name: IconName;
  /** Explicit pixel size. Overrides `sizeToken` / `context`. */
  size?: number;
  /** Semantic size token from ICON_SIZES. */
  sizeToken?: IconSizeToken;
  /** UI context size from ICON_CONTEXT_SIZE. */
  context?: IconContext;
  /** Phosphor weight; `filled` maps to `fill` when weight omitted. */
  weight?: IconWeight;
  /** Convenience for active navigation / selected states. */
  filled?: boolean;
  /** Semantic color role via CSS tokens. Default inherits parent color. */
  tone?: IconTone;
  title?: string;
}

function resolveSize(
  size: number | undefined,
  sizeToken: IconSizeToken | undefined,
  context: IconContext | undefined,
): number {
  if (typeof size === "number") return size;
  if (sizeToken) return ICON_SIZES[sizeToken];
  if (context) return ICON_CONTEXT_SIZE[context];
  return ICON_SIZES.default;
}

export function AppIcon({
  name,
  size,
  sizeToken,
  context,
  weight,
  filled = false,
  tone = "inherit",
  title,
  className,
  ...rest
}: AppIconProps) {
  const Component = icons[name];
  const px = resolveSize(size, sizeToken, context);
  const resolvedWeight: IconWeight = weight ?? (filled ? "fill" : "regular");
  const toneClass = tone === "inherit" ? undefined : TONE_CLASS[tone];
  const logoClass = name === "logo" ? styles.logo : undefined;

  return (
    <Component
      size={px}
      weight={resolvedWeight}
      className={[styles.root, toneClass, logoClass, className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    />
  );
}

/** @deprecated Prefer AppIcon; kept for call-site compatibility. */
export const Icon = AppIcon;
export type IconProps = AppIconProps;
export type { IconName };
