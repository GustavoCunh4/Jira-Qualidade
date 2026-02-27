import { ReactNode } from "react";

type CardVariant = "default" | "highlight" | "subtle" | "flat";

export default function Card({
  title,
  subtitle,
  hint,
  actions,
  children,
  variant = "default",
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
}) {
  const hasHeader = title || subtitle || actions;

  return (
    <section className={`ui-card ui-card--${variant} ${className}`.trim()}>
      {hasHeader ? (
        <header className="ui-card__header">
          <div className="ui-card__header-main">
            {title ? <h3 className="ui-card__title">{title}</h3> : null}
            {subtitle ? <p className="ui-card__subtitle">{subtitle}</p> : null}
            {hint ? <div className="ui-card__hint">{hint}</div> : null}
          </div>
          {actions ? <div className="ui-card__header-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
