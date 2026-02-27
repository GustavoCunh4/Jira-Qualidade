import { EmptyState as BaseEmptyState } from "../ui";
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
    <div className="dashboard-empty-state">
      <BaseEmptyState title={title} description={description} action={action} compact={compact} />
    </div>
  );
}
