import { formatDateOnly } from "./format";
import { DashboardResponse } from "./types";

export type Trend = {
  delta: number;
  pct: number | null;
  positive: boolean | null;
};

type ThroughputPoint = DashboardResponse["throughput"][number];

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function buildTrend(current?: number, previous?: number): Trend | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  const delta = current - previous;
  if (delta === 0) return { delta: 0, pct: 0, positive: null };
  return {
    delta,
    pct: previous === 0 ? null : (delta / previous) * 100,
    positive: delta > 0,
  };
}

export function formatTrendLabel(
  trend: Trend | null | undefined,
  options?: { invertMeaning?: boolean }
) {
  if (!trend) return undefined;
  if (trend.delta === 0) return "-> sem variacao";

  const positiveForUI =
    trend.positive === null ? null : options?.invertMeaning ? !trend.positive : trend.positive;

  const arrow = positiveForUI === null ? "->" : positiveForUI ? "↑" : "↓";
  const deltaAbs = Math.abs(trend.delta);
  const pct = trend.pct == null ? "" : ` (${Math.abs(trend.pct).toFixed(1)}%)`;
  return `${arrow} ${deltaAbs}${pct}`;
}

export function formatSignedPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function diffInDays(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
}

export function buildWeeklyThroughput(points: ThroughputPoint[]) {
  if (!points.length) return [] as { label: string; throughput: number }[];

  const recent = points.slice(-56);
  const result: { label: string; throughput: number }[] = [];

  for (let i = 0; i < recent.length; i += 7) {
    const chunk = recent.slice(i, i + 7);
    if (!chunk.length) continue;

    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const throughput = chunk.reduce((acc, item) => acc + Number(item.throughput || 0), 0);

    result.push({
      label: `${formatDateOnly(first.day)}-${formatDateOnly(last.day)}`,
      throughput,
    });
  }

  return result.slice(-8);
}
