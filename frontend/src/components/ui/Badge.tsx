import { ReactNode } from "react";
import { StatusTone } from "../../lib/status";

type Variant = StatusTone | "info" | "muted";

export default function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return <span className={`ui-badge ui-badge--${variant} ${className}`.trim()}>{children}</span>;
}
