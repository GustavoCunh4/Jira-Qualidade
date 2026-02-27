import { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state2 ${compact ? "empty-state2--compact" : ""}`.trim()}>
      <div className="empty-state2__title">{title}</div>
      {description ? <div className="empty-state2__desc">{description}</div> : null}
      {action ? <div className="empty-state2__action">{action}</div> : null}
    </div>
  );
}
