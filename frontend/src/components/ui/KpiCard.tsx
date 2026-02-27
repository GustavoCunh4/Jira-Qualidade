import Badge from "./Badge";
import TooltipHint from "./TooltipHint";

export default function KpiCard({
  label,
  value,
  tone = "neutral",
  trendLabel,
  trendPositive,
  hint,
  className = "",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "done" | "progress" | "planned" | "warning";
  trendLabel?: string;
  trendPositive?: boolean | null;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`kpi-card2 kpi-card2--${tone} ${className}`.trim()}>
      <div className="kpi-card2__label-row">
        <span className="kpi-card2__label">{label}</span>
        {hint ? <TooltipHint text={hint} /> : null}
      </div>
      <div className="kpi-card2__value">{value}</div>
      <div className="kpi-card2__footer">
        {trendLabel ? (
          <Badge variant={trendPositive === null ? "muted" : trendPositive ? "done" : "warning"}>
            {trendLabel}
          </Badge>
        ) : (
          <span className="kpi-card2__muted">Sem base comparativa</span>
        )}
      </div>
    </div>
  );
}
