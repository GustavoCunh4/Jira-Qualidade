import { formatDateTime } from "../../lib/format";

export default function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const tooltipTitle =
    typeof label === "string" && /^\d{4}-\d{2}-\d{2}/.test(label)
      ? formatDateTime(label, false)
      : String(label ?? "-");

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__title">{tooltipTitle}</div>
      <div className="chart-tooltip__list">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="chart-tooltip__row">
            <span className="chart-tooltip__key">
              <i style={{ background: item.color }} />
              {String(item.name || item.dataKey)}
            </span>
            <strong>
              {typeof item.value === "number" ? item.value.toLocaleString("pt-BR") : item.value}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
