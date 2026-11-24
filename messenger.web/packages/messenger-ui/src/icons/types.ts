import type { ComponentType, SVGAttributes } from "react";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

/** Semantic sizes for DIOS Iconography System. */
export const ICON_SIZES = {
  status: 14,
  action: 16,
  menu: 18,
  default: 20,
  nav: 22,
  mobile: 24,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZES;

export type IconWeight = NonNullable<PhosphorIconProps["weight"]>;

export type IconTone =
  | "inherit"
  | "muted"
  | "default"
  | "strong"
  | "active"
  | "danger"
  | "disabled";

export type AppIconComponent = ComponentType<
  PhosphorIconProps & SVGAttributes<SVGSVGElement>
>;
