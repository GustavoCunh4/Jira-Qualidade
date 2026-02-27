import { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  iconLeft?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
  loading?: boolean;
};

export default function Button({
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  children,
  className = "",
  loading,
  disabled,
  ...props
}: Props) {
  const isDisabled = disabled || loading;
  const buttonType = props.type ?? "button";
  return (
    <button
      {...props}
      type={buttonType}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`ui-btn ui-btn--${variant} ui-btn--${size} ${loading ? "is-loading" : ""} ${className}`.trim()}
    >
      {iconLeft && <Icon name={iconLeft} size={16} className="ui-btn__icon" />}
      <span className="ui-btn__label">{loading ? "Carregando..." : children}</span>
      {iconRight && <Icon name={iconRight} size={16} className="ui-btn__icon" />}
    </button>
  );
}
