import { ReactNode } from "react";
import { Card } from "../ui";

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "default" | "highlight" | "subtle" | "flat";
};

export default function ChartCard({
  title,
  subtitle,
  actions,
  hint,
  children,
  className = "",
  variant = "default",
}: Props) {
  return (
    <Card
      variant={variant}
      className={`dashboard-chart-card ${className}`.trim()}
      title={title}
      subtitle={subtitle}
      hint={hint}
      actions={actions}
    >
      {children}
    </Card>
  );
}
