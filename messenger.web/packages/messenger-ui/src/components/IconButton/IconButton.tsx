import type { ButtonHTMLAttributes } from "react";
import { AppIcon, type AppIconProps } from "../../icons/AppIcon.js";
import type { IconName } from "../../icons/iconRegistry.js";
import styles from "./IconButton.module.css";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "quiet" | "danger" | "send";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Accessible name — required for icon-only controls. */
  label: string;
  icon: IconName;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
  iconSize?: AppIconProps["size"];
  filled?: boolean;
  iconTone?: AppIconProps["tone"];
}

const ICON_PX: Record<IconButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 22,
};

export function IconButton({
  label,
  icon,
  size = "md",
  variant = "quiet",
  active = false,
  iconSize,
  filled,
  iconTone,
  disabled,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[size], styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      aria-pressed={active || undefined}
      data-active={active ? "true" : undefined}
      disabled={disabled}
      title={rest.title ?? label}
      {...rest}
    >
      <AppIcon
        name={icon}
        size={iconSize ?? ICON_PX[size]}
        filled={filled ?? (active && variant === "quiet")}
        tone={iconTone ?? (variant === "send" ? "inherit" : undefined)}
      />
    </button>
  );
}
