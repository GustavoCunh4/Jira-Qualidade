import { ReactNode } from "react";

export default function SectionHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="dashboard-section__head">
      <div className="dashboard-section__copy">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="dashboard-section__actions">{actions}</div> : null}
    </div>
  );
}
