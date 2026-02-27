export default function MetricTile({
  label,
  value,
  trend,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  trend?: string;
  caption?: string;
  tone?: "neutral" | "progress" | "warning" | "info";
}) {
  return (
    <div className={`dashboard-metric-tile dashboard-metric-tile--${tone}`}>
      <span className="dashboard-metric-tile__label">{label}</span>
      <strong className="dashboard-metric-tile__value">{value}</strong>
      {trend ? <span className="dashboard-metric-tile__trend">{trend}</span> : null}
      {caption ? <span className="dashboard-metric-tile__caption">{caption}</span> : null}
    </div>
  );
}
