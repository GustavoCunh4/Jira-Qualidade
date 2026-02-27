import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../lib/api";
import { clampText, daysSince, formatDateOnly, formatDateTime } from "../lib/format";
import {
  isBlocked,
  isLikelyDoneStatus,
  isLikelyInProgressStatus,
  priorityWeight,
} from "../lib/status";
import { onGlobalSyncDone } from "../lib/uiEvents";
import { DashboardResponse, Issue, JiraConnectionStatus } from "../lib/types";
import {
  average,
  buildTrend,
  diffInDays,
  formatSignedPercent,
  formatTrendLabel,
} from "../lib/dashboardMetrics";
import { Badge, Button, KpiCard } from "../components/ui";
import ChartCard from "../components/dashboard/ChartCard";
import DashboardEmptyState from "../components/dashboard/EmptyState";
import LoadingSkeleton from "../components/dashboard/LoadingSkeleton";
import MetricTile from "../components/dashboard/MetricTile";
import PersonDetailsPanel from "../components/dashboard/PersonDetailsPanel";
import PersonSelector, { PersonSelectorOption } from "../components/dashboard/PersonSelector";
import SectionHead from "../components/dashboard/SectionHead";
import ChartTooltip from "../components/dashboard/ChartTooltip";

type IssueListResponse = {
  issues: Issue[];
  total: number;
};

type CriticalItem = Issue & {
  agingDays: number;
  blocked: boolean;
  score: number;
};

type WipRanking = {
  assignee: string;
  wip: number;
  total: number;
  blocked: number;
};

type EfficiencyPoint = {
  day: string;
  avgDays: number;
  samples: number;
};

const emptyDashboard: DashboardResponse = {
  kpis: {},
  throughput: [],
  aging: [],
  blockers: [],
};

const RANGE_OPTIONS = [7, 30] as const;

export const CHART_COLORS = {
  cyan: "#3be6ff",
  blue: "#62a7ff",
  lime: "#56e9ab",
  amber: "#ffba58",
  orange: "#ff8a4b",
  red: "#ff6178",
  violet: "#8f7dff",
};

export const CHART_GRID_COLOR = "rgba(255,255,255,.06)";
export const CHART_AXIS_COLOR = "rgba(255,255,255,.1)";
export const CHART_AXIS_TICK = { fill: "#9fb3d0", fontSize: 11 };
export const CHART_CURSOR = { stroke: "rgba(255,255,255,.12)", strokeWidth: 1 };

const CHART_PALETTE = [
  CHART_COLORS.cyan,
  CHART_COLORS.blue,
  CHART_COLORS.lime,
  CHART_COLORS.amber,
  CHART_COLORS.violet,
  CHART_COLORS.orange,
  CHART_COLORS.red,
];

const STATUS_CHART_PALETTE = [
  "#30e9ff",
  "#7cff61",
  "#ffcf4a",
  "#ff6b6b",
  "#b287ff",
  "#ff4fa0",
  "#5aa9ff",
  "#ff8b3d",
  "#24d6a4",
  "#f06dff",
];

function safeDayKey(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizePriorityLabel(priority?: string | null) {
  const raw = (priority || "").trim();
  if (!raw) return "Sem prioridade";

  const lower = raw.toLowerCase();
  if (lower.includes("highest")) return "Highest";
  if (lower.includes("high") || lower.includes("alta")) return "High";
  if (lower.includes("medium") || lower.includes("media") || lower.includes("mÃ©dia")) return "Medium";
  if (lower.includes("lowest")) return "Lowest";
  if (lower.includes("low") || lower.includes("baixa")) return "Low";
  return raw;
}

function metricToneFromHealth(variant: "warning" | "done" | "info") {
  if (variant === "done") return "done" as const;
  if (variant === "warning") return "warning" as const;
  return "progress" as const;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<DashboardResponse>(emptyDashboard);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [autoSync, setAutoSync] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [deliveryView, setDeliveryView] = useState<"balance" | "backlog">("balance");
  const [structureView, setStructureView] = useState<"status" | "wip_columns">("status");
  const [efficiencyView, setEfficiencyView] = useState<"lead" | "cycle">("lead");

  const loadData = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError(null);

    try {
      const [dashboardResp, issuesResp, connectionResp] = await Promise.all([
        apiFetch<DashboardResponse>("/dashboard"),
        apiFetch<IssueListResponse>("/issues?start_at=0&max_results=150"),
        apiFetch<JiraConnectionStatus>("/settings/jira/connection-test").catch(() => null),
      ]);

      setDashboard(dashboardResp);
      setIssues(issuesResp.issues || []);
      setJiraBaseUrl(connectionResp?.jira_base_url || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dashboard.");
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, []);

  useEffect(() => onGlobalSyncDone(() => void loadData(false)), []);

  useEffect(() => {
    if (!autoSync) return;

    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await apiFetch("/jira/sync-now", { method: "POST" });
        await loadData(false);
      } catch {
        // Keep current UI.
      }
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [autoSync]);

  const throughputSeries = useMemo(() => {
    const base = dashboard.throughput || [];
    return base.slice(-rangeDays);
  }, [dashboard.throughput, rangeDays]);

  const flowSeries = useMemo(() => {
    return throughputSeries.map((point, index) => {
      const prev = throughputSeries[index - 1];
      const created = prev ? Math.max(0, (point.total || 0) - (prev.total || 0)) : 0;
      const completed =
        typeof point.throughput === "number"
          ? Math.max(0, point.throughput)
          : prev
            ? Math.max(0, (point.done || 0) - (prev.done || 0))
            : 0;
      return { day: point.day, created, completed };
    });
  }, [throughputSeries]);

  const snapshotTrend = useMemo(() => {
    const series = dashboard.throughput || [];
    const last = series.length ? series[series.length - 1] : undefined;
    const prev = series.length > 1 ? series[series.length - 2] : undefined;
    const lastBacklog =
      typeof last?.total === "number" && typeof last?.done === "number"
        ? Math.max(last.total - last.done, 0)
        : undefined;
    const prevBacklog =
      typeof prev?.total === "number" && typeof prev?.done === "number"
        ? Math.max(prev.total - prev.done, 0)
        : undefined;
    const lastPercentDone =
      typeof last?.total === "number" && last.total > 0 && typeof last?.done === "number"
        ? (last.done / last.total) * 100
        : undefined;
    const prevPercentDone =
      typeof prev?.total === "number" && prev.total > 0 && typeof prev?.done === "number"
        ? (prev.done / prev.total) * 100
        : undefined;

    return {
      total: buildTrend(last?.total, prev?.total),
      done: buildTrend(last?.done, prev?.done),
      throughput: buildTrend(last?.throughput, prev?.throughput),
      wip: buildTrend(
        Number(dashboard.kpis?.wip || 0),
        prev ? Math.max((prev.total || 0) - (prev.done || 0), 0) : undefined
      ),
      backlog: buildTrend(lastBacklog, prevBacklog),
      percentDone: buildTrend(lastPercentDone, prevPercentDone),
      latestTotal: last?.total,
      previousTotal: prev?.total,
    };
  }, [dashboard.throughput, dashboard.kpis?.wip]);

  const derived = useMemo(() => {
    const statusCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();
    const wipStatusCounts = new Map<string, number>();
    const personMap = new Map<string, PersonSelectorOption>();
    const wipRankingMap = new Map<string, WipRanking>();
    const leadTimeBuckets = new Map<string, { sum: number; count: number }>();
    const cycleTimeBuckets = new Map<string, { sum: number; count: number }>();

    const agingBuckets = [
      { label: "0-2d", min: 0, max: 2, count: 0 },
      { label: "3-7d", min: 3, max: 7, count: 0 },
      { label: "8-14d", min: 8, max: 14, count: 0 },
      { label: "15+d", min: 15, max: Number.POSITIVE_INFINITY, count: 0 },
    ];

    let blockedCount = 0;
    let inProgressCount = 0;
    let inProgressAgingSum = 0;

    const leadTimeSamples: number[] = [];
    const cycleTimeSamples: number[] = [];
    const inProgressItems: (Issue & { agingDays: number; blocked: boolean })[] = [];
    const critical: CriticalItem[] = [];

    for (const rawIssue of issues) {
      const issue: Issue = {
        ...rawIssue,
        labels: rawIssue.labels || [],
      };

      const status = issue.status || "Sem status";
      const labels = issue.labels || [];
      const blocked = isBlocked(labels);
      const inProgress = isLikelyInProgressStatus(status);
      const done = isLikelyDoneStatus(status);
      const agingDays = daysSince(issue.updated_at || issue.created_at);
      const priority = normalizePriorityLabel(issue.priority);

      if (blocked) blockedCount += 1;
      if (inProgress) {
        inProgressCount += 1;
        inProgressAgingSum += agingDays;
        inProgressItems.push({ ...issue, agingDays, blocked });
        wipStatusCounts.set(status, (wipStatusCounts.get(status) || 0) + 1);

        for (const bucket of agingBuckets) {
          if (agingDays >= bucket.min && agingDays <= bucket.max) {
            bucket.count += 1;
            break;
          }
        }
      }

      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      priorityCounts.set(priority, (priorityCounts.get(priority) || 0) + 1);

      const durationDays = diffInDays(issue.created_at, issue.updated_at);
      const updatedDay = safeDayKey(issue.updated_at);
      if (typeof durationDays === "number") {
        if (done) leadTimeSamples.push(durationDays);
        if (done || inProgress) cycleTimeSamples.push(durationDays);

        if (updatedDay && done) {
          const bucket = leadTimeBuckets.get(updatedDay) || { sum: 0, count: 0 };
          bucket.sum += durationDays;
          bucket.count += 1;
          leadTimeBuckets.set(updatedDay, bucket);
        }

        if (updatedDay && (done || inProgress)) {
          const bucket = cycleTimeBuckets.get(updatedDay) || { sum: 0, count: 0 };
          bucket.sum += durationDays;
          bucket.count += 1;
          cycleTimeBuckets.set(updatedDay, bucket);
        }
      }

      if (issue.assignee && issue.assignee.trim()) {
        const name = issue.assignee.trim();

        const person = personMap.get(name) || {
          name,
          total: 0,
          inProgress: 0,
          done: 0,
          blocked: 0,
        };
        person.total += 1;
        if (inProgress) person.inProgress += 1;
        if (done) person.done += 1;
        if (blocked) person.blocked += 1;
        personMap.set(name, person);

        const rank = wipRankingMap.get(name) || {
          assignee: name,
          wip: 0,
          total: 0,
          blocked: 0,
        };
        rank.total += 1;
        if (inProgress) rank.wip += 1;
        if (blocked) rank.blocked += 1;
        wipRankingMap.set(name, rank);
      }

      critical.push({
        ...issue,
        agingDays,
        blocked,
        score:
          (blocked ? 1000 : 0) +
          (inProgress ? 220 : 0) +
          priorityWeight(issue.priority) * 20 +
          agingDays,
      });
    }

    const accumulatedColumns = Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    const priorityDistribution = Array.from(priorityCounts.entries())
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => {
        const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (weightDiff !== 0) return weightDiff;
        return b.count - a.count;
      });
    const wipByColumn = Array.from(wipStatusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    const leadTimeTrend = Array.from(leadTimeBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bucket]) => ({ day, avgDays: bucket.sum / bucket.count, samples: bucket.count }));
    const cycleTimeTrend = Array.from(cycleTimeBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bucket]) => ({ day, avgDays: bucket.sum / bucket.count, samples: bucket.count }));

    const oldestInProgress = inProgressItems
      .slice()
      .sort((a, b) => b.agingDays - a.agingDays)
      .slice(0, 4);

    const criticalItems = critical.slice().sort((a, b) => b.score - a.score).slice(0, 6);

    const personOptions = Array.from(personMap.values()).sort((a, b) => {
      if (b.inProgress !== a.inProgress) return b.inProgress - a.inProgress;
      return b.total - a.total;
    });

    const peopleWithHighestWip = Array.from(wipRankingMap.values())
      .filter((item) => item.wip > 0)
      .sort((a, b) => {
        if (b.wip !== a.wip) return b.wip - a.wip;
        return b.total - a.total;
      })
      .slice(0, 8);

    return {
      agingBuckets,
      accumulatedColumns,
      priorityDistribution,
      wipByColumn,
      leadTimeTrend,
      cycleTimeTrend,
      oldestInProgress,
      criticalItems,
      personOptions,
      peopleWithHighestWip,
      blockedCount,
      blockedPct: issues.length ? (blockedCount / issues.length) * 100 : 0,
      averageAgingInProgress: inProgressCount ? inProgressAgingSum / inProgressCount : 0,
      averageLeadTime: average(leadTimeSamples),
      averageCycleTime: average(cycleTimeSamples),
    };
  }, [issues]);

  useEffect(() => {
    if (!derived.personOptions.length) {
      if (selectedPerson) setSelectedPerson("");
      return;
    }

    const exists = derived.personOptions.some((item) => item.name === selectedPerson);
    if (!selectedPerson || !exists) {
      setSelectedPerson(derived.personOptions[0].name);
    }
  }, [derived.personOptions, selectedPerson]);

  const selectedPersonIssues = useMemo(() => {
    if (!selectedPerson) return [];
    return issues.filter((issue) => (issue.assignee || "").trim() === selectedPerson);
  }, [issues, selectedPerson]);

  const snapshotStale = useMemo(() => {
    const latest = dashboard.meta?.latest_snapshot_at;
    const interval = dashboard.meta?.snapshot_interval_minutes ?? 10;
    if (!latest) return false;
    const diffMinutes = (Date.now() - new Date(latest).getTime()) / 60_000;
    return diffMinutes > interval * 2 + 1;
  }, [dashboard.meta?.latest_snapshot_at, dashboard.meta?.snapshot_interval_minutes]);

  const throughputAverage = useMemo(
    () => average(throughputSeries.map((item) => Number(item.throughput || 0))),
    [throughputSeries]
  );

  const backlogTrendSeries = useMemo(
    () =>
      throughputSeries.map((point) => ({
        day: point.day,
        backlog: Math.max(Number(point.total || 0) - Number(point.done || 0), 0),
      })),
    [throughputSeries]
  );

  const statusDistributionChartData = useMemo(
    () =>
      derived.accumulatedColumns.slice(0, 8).map((item, index) => ({
        status: clampText(item.status, 20),
        fullStatus: item.status,
        count: item.count,
        color: STATUS_CHART_PALETTE[index % STATUS_CHART_PALETTE.length],
      })),
    [derived.accumulatedColumns]
  );

  const wipByColumnChartData = useMemo(
    () =>
      derived.wipByColumn.slice(0, 8).map((item, index) => ({
        status: clampText(item.status, 20),
        fullStatus: item.status,
        count: item.count,
        color: [CHART_COLORS.orange, CHART_COLORS.amber, CHART_COLORS.red, CHART_COLORS.violet][index % 4],
      })),
    [derived.wipByColumn]
  );

  const priorityChartData = useMemo(
    () =>
      derived.priorityDistribution.slice(0, 8).map((item, index) => ({
        priority: clampText(item.priority, 16),
        fullPriority: item.priority,
        count: item.count,
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      })),
    [derived.priorityDistribution]
  );

  const peopleWipChartData = useMemo(
    () =>
      derived.peopleWithHighestWip.map((person, index) => ({
        assignee: clampText(person.assignee, 22),
        fullAssignee: person.assignee,
        wip: person.wip,
        total: person.total,
        blocked: person.blocked,
        loadPct: person.total ? (person.wip / person.total) * 100 : 0,
        color: [CHART_COLORS.cyan, CHART_COLORS.blue, CHART_COLORS.lime, CHART_COLORS.violet][index % 4],
      })),
    [derived.peopleWithHighestWip]
  );

  const efficiencySeries = useMemo(() => {
    const source: EfficiencyPoint[] =
      efficiencyView === "lead" ? (derived.leadTimeTrend as EfficiencyPoint[]) : (derived.cycleTimeTrend as EfficiencyPoint[]);
    return source.slice(-rangeDays);
  }, [derived.leadTimeTrend, derived.cycleTimeTrend, efficiencyView, rangeDays]);

  const efficiencyAverage = useMemo(
    () => average(efficiencySeries.map((point) => point.avgDays)),
    [efficiencySeries]
  );

  const efficiencyTrend = useMemo(() => {
    const last = efficiencySeries.length ? efficiencySeries[efficiencySeries.length - 1] : undefined;
    const prev = efficiencySeries.length > 1 ? efficiencySeries[efficiencySeries.length - 2] : undefined;
    return buildTrend(last?.avgDays, prev?.avgDays);
  }, [efficiencySeries]);

  const dashboardHealth = useMemo(() => {
    const k = dashboard.kpis || {};
    const completion = Number(k.percent_done || 0);
    const wip = Number(k.wip || 0);
    const blockerCount = dashboard.blockers.length;
    const warningAgingCount =
      (derived.agingBuckets.find((bucket) => bucket.label === "8-14d")?.count || 0) +
      (derived.agingBuckets.find((bucket) => bucket.label === "15+d")?.count || 0);

    if (blockerCount >= 3 || warningAgingCount >= 5) {
      return {
        variant: "warning" as const,
        state: "Critico",
        label: `${blockerCount} bloqueio(s) / ${warningAgingCount} itens antigos`,
      };
    }
    if (blockerCount > 0 || wip >= Math.max(8, Number(k.in_progress || 0))) {
      return {
        variant: "warning" as const,
        state: "Alerta",
        label: "WIP alto ou bloqueios ativos",
      };
    }
    if (completion >= 70) {
      return {
        variant: "done" as const,
        state: "Estavel",
        label: "Ritmo de entrega sustentado",
      };
    }
    return {
      variant: "info" as const,
      state: "Atencao",
      label: "Monitorar ritmo e aging",
    };
  }, [dashboard.blockers.length, dashboard.kpis, derived.agingBuckets]);

  const kpiItems = useMemo(() => {
    const k = dashboard.kpis || {};
    const healthTone = metricToneFromHealth(dashboardHealth.variant);

    return [
      {
        label: "Total issues",
        value: k.total || 0,
        tone: "neutral" as const,
        trendLabel: formatTrendLabel(snapshotTrend.total),
        trendPositive: snapshotTrend.total?.positive ?? null,
        hint: "Volume total de issues no snapshot atual.",
      },
      {
        label: "Concluidas",
        value: k.done || 0,
        tone: "done" as const,
        trendLabel: formatTrendLabel(snapshotTrend.done),
        trendPositive: snapshotTrend.done?.positive ?? null,
        hint: "Issues em status finalizado.",
      },
      {
        label: "Em andamento",
        value: k.in_progress || 0,
        tone: "progress" as const,
        trendLabel: formatTrendLabel(snapshotTrend.wip, { invertMeaning: true }),
        trendPositive:
          snapshotTrend.wip?.positive === null
            ? null
            : snapshotTrend.wip?.positive
              ? false
              : true,
        hint: "Volume de itens ativos no fluxo atual.",
      },
      {
        label: "% concluido",
        value: `${k.percent_done || 0}%`,
        tone: "done" as const,
        trendLabel: formatTrendLabel(snapshotTrend.percentDone),
        trendPositive: snapshotTrend.percentDone?.positive ?? null,
        hint: "Percentual concluido dentro do conjunto atual.",
      },
      {
        label: "Saude do fluxo",
        value: dashboardHealth.state,
        tone: healthTone,
        trendLabel: snapshotStale ? "snapshot defasado" : dashboardHealth.label,
        trendPositive: dashboardHealth.variant === "done" ? true : dashboardHealth.variant === "warning" ? false : null,
        hint: "Leitura rapida da saude operacional para decisao.",
      },
    ];
  }, [dashboard.kpis, dashboardHealth, snapshotTrend, snapshotStale]);

  const structureChartModeMeta = useMemo(() => {
    if (structureView === "wip_columns") {
      return {
        title: "WIP por coluna",
        subtitle: "Onde o trabalho em andamento esta acumulando no fluxo",
        data: wipByColumnChartData,
        emptyTitle: "Sem WIP por coluna",
        badge: `${wipByColumnChartData.length} colunas`,
      };
    }
    return {
      title: "Distribuicao por status",
      subtitle: "Concentracao atual do trabalho por status/coluna",
      data: statusDistributionChartData,
      emptyTitle: "Sem dados de status",
      badge: `${statusDistributionChartData.length} status`,
    };
  }, [structureView, statusDistributionChartData, wipByColumnChartData]);

  const flowBalanceAverages = useMemo(
    () => ({
      created: average(flowSeries.map((item) => item.created)),
      completed: average(flowSeries.map((item) => item.completed)),
    }),
    [flowSeries]
  );

  const backlogTrendLabel = useMemo(
    () => formatTrendLabel(snapshotTrend.backlog, { invertMeaning: true }),
    [snapshotTrend.backlog]
  );

  const efficiencyModeMeta = useMemo(() => {
    if (efficiencyView === "lead") {
      return {
        title: "Tempo médio para concluir",
        subtitle: "Evolucao diaria do tempo médio ate a conclusao dos itens",
        seriesName: "Tempo médio para concluir",
        color: CHART_COLORS.amber,
        caption: "Estimado por created -> updated (itens concluidos).",
      };
    }

    return {
      title: "Tempo médio em andamento",
      subtitle: "Evolucao diaria do tempo meédio dos itens em fluxo/concluidos",
      seriesName: "Tempo médio em andamento",
      color: CHART_COLORS.violet,
      caption: "Estimado por created -> updated (itens ativos e concluidos).",
    };
  }, [efficiencyView]);

  const hasAnyData = issues.length > 0 || (dashboard.throughput?.length || 0) > 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      await apiFetch("/dashboard/refresh", { method: "POST" });
      await loadData(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar dados.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const handleOpenIssuesFiltered = (assignee?: string | null) => {
    persistIssuesPrefill({ assignee: assignee || undefined });
    navigate("/issues");
  };

  const handleOpenIssueDetails = (issueKey: string) => {
    persistIssuesPrefill({ text: issueKey });
    navigate("/issues");
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="dashboard-v3 page-stack is-tv-mode">
      {snapshotStale ? (
        <div className="dashboard-alert dashboard-alert--warn">
          <div>Snapshot mais antigo que o esperado. Sincronize agora para evitar leitura desatualizada.</div>
          <Button variant="ghost" size="sm" iconLeft="sync" onClick={handleRefresh}>
            Sincronizar
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="dashboard-alert dashboard-alert--error">
          <div>{error}</div>
          <Button variant="ghost" size="sm" iconLeft="sync" onClick={() => void loadData(false)}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {!hasAnyData ? (
        <ChartCard
          className="dashboard-card--empty"
          title="Sem dados ainda"
          subtitle="Execute a coleta para preencher o dashboard"
          actions={
            <Button size="sm" iconLeft="bolt" onClick={handleRefresh} loading={refreshing}>
              Coletar agora
            </Button>
          }
        >
          <DashboardEmptyState
            title="Dashboard vazio"
            description="Nao ha snapshots suficientes para exibir metricas, graficos e riscos."
          />
        </ChartCard>
      ) : null}

      <section className="dashboard-section" aria-label="Secao 1 - KPIs">
        <SectionHead
          title="KPIs Executivos"
          subtitle="Leitura rapida de volume, progresso, WIP e saude do fluxo."
          actions={
            <div className="dashboard-inline-meta">
              <Button
                variant="ghost"
                size="sm"
                iconLeft="people"
                onClick={() => navigate("/people")}
                className="dashboard-inline-nav-btn"
                title="Ir para Pessoas"
              >
                Pessoas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconLeft="settings"
                onClick={() => navigate("/settings")}
                className="dashboard-inline-nav-btn"
                title="Ir para Configuracoes"
              >
                Config.
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconLeft="logout"
                onClick={handleLogout}
                className="dashboard-inline-nav-btn"
                title="Sair"
              >
                Sair
              </Button>
              <Badge variant="muted">
                Snapshot {formatDateTime(dashboard.meta?.latest_snapshot_at)}
              </Badge>
              <Badge variant="muted">
                {dashboard.meta?.snapshot_interval_minutes || "-"} min
              </Badge>
              <label className="dashboard-inline-toggle" title="Ativar sincronizacao automatica do dashboard">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(event) => setAutoSync(event.target.checked)}
                />
                <span>Auto sync</span>
              </label>
            </div>
          }
        />

        <div className="dashboard-kpi-grid dashboard-kpi-grid--exec">
          {kpiItems.map((item) => (
            <KpiCard
              key={item.label}
              className="dashboard-kpi-card"
              label={item.label}
              value={item.value}
              tone={item.tone}
              hint={item.hint}
              trendLabel={item.trendLabel}
              trendPositive={item.trendPositive}
            />
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-label="Ritmo de entrega">
        <SectionHead
          title="Ritmo de entrega"
          subtitle="Ritmo de entrega, pressao de backlog e eficiencia operacional no periodo selecionado."
          actions={
            <div className="dashboard-range-toggle" role="tablist" aria-label="Periodo do dashboard">
              {RANGE_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={days === rangeDays ? "is-active" : ""}
                  onClick={() => setRangeDays(days)}
                  role="tab"
                  aria-selected={days === rangeDays}
                >
                  {days}d
                </button>
              ))}
            </div>
          }
        />

        <ChartCard
          variant="highlight"
          title="Entregas por dia"
          subtitle="Ritmo de entrega por dia no periodo selecionado, com media destacada"
          actions={
            <div className="dashboard-card-actions-inline">
              <Badge variant="info">{rangeDays} dias</Badge>
              <Badge variant="muted">media {throughputAverage.toFixed(1)}/dia</Badge>
            </div>
          }
        >
          {throughputSeries.length === 0 ? (
            <DashboardEmptyState
              title="Sem historico de entregas"
              description="Aguarde snapshots para preencher a serie diaria."
              compact
            />
          ) : (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={throughputSeries} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(value) => formatDateOnly(value)}
                    tick={CHART_AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: CHART_AXIS_COLOR }}
                  />
                  <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                  <ReferenceLine
                    y={throughputAverage}
                    stroke="rgba(255,255,255,.22)"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                  <Line
                    type="monotone"
                    dataKey="throughput"
                    name="Entregas"
                    stroke={CHART_COLORS.cyan}
                    strokeWidth={3}
                    dot={{ r: 2.2, fill: CHART_COLORS.cyan, stroke: CHART_COLORS.cyan }}
                    activeDot={{ r: 4, fill: CHART_COLORS.cyan, stroke: "#071019" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <div className="dashboard-grid dashboard-grid--two">
          <ChartCard
            variant="highlight"
            title={deliveryView === "balance" ? "Criados vs Concluidos" : "Backlog Trend"}
            subtitle={
              deliveryView === "balance"
                ? "Entrada vs entrega para ver se o backlog esta crescendo ou reduzindo"
                : "Evolucao do backlog aberto (total - concluidos) no periodo selecionado"
            }
            actions={
              <div className="dashboard-card-actions-inline">
                <div className="dashboard-segmented-toggle" role="tablist" aria-label="Modo de entrega">
                  <button
                    type="button"
                    className={deliveryView === "balance" ? "is-active" : ""}
                    role="tab"
                    aria-selected={deliveryView === "balance"}
                    onClick={() => setDeliveryView("balance")}
                  >
                    Fluxo
                  </button>
                  <button
                    type="button"
                    className={deliveryView === "backlog" ? "is-active" : ""}
                    role="tab"
                    aria-selected={deliveryView === "backlog"}
                    onClick={() => setDeliveryView("backlog")}
                  >
                    Backlog
                  </button>
                </div>
                {deliveryView === "balance" ? (
                  <Badge variant="muted">
                    media {flowBalanceAverages.created.toFixed(1)} criados / {flowBalanceAverages.completed.toFixed(1)} concl.
                  </Badge>
                ) : (
                  <Badge variant="muted">{backlogTrendLabel || "sem tendencia"}</Badge>
                )}
              </div>
            }
          >
            {deliveryView === "balance" ? (
              flowSeries.length === 0 ? (
                <DashboardEmptyState
                  title="Sem historico de fluxo"
                  description="A serie sera exibida quando houver snapshots diarios."
                  compact
                />
              ) : (
                <div className="dashboard-chart">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={flowSeries} barGap={6} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(value) => formatDateOnly(value)}
                        tick={CHART_AXIS_TICK}
                        tickLine={false}
                        axisLine={{ stroke: CHART_AXIS_COLOR }}
                      />
                      <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                      <Bar dataKey="created" name="Criados" fill={CHART_COLORS.blue} radius={[8, 8, 0, 0]} />
                      <Bar dataKey="completed" name="Concluidos" fill={CHART_COLORS.lime} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : backlogTrendSeries.length === 0 ? (
              <DashboardEmptyState title="Sem historico de backlog" compact />
            ) : (
              <div className="dashboard-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={backlogTrendSeries} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(value) => formatDateOnly(value)}
                      tick={CHART_AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: CHART_AXIS_COLOR }}
                    />
                    <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                    <Area
                      type="monotone"
                      dataKey="backlog"
                      name="Backlog aberto"
                      stroke={CHART_COLORS.amber}
                      fill={CHART_COLORS.amber}
                      fillOpacity={0.18}
                      strokeWidth={2.8}
                      dot={{ r: 2, fill: CHART_COLORS.amber }}
                      activeDot={{ r: 4, fill: CHART_COLORS.amber, stroke: "#071019" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title={efficiencyModeMeta.title}
            subtitle={efficiencyModeMeta.subtitle}
            actions={
              <div className="dashboard-card-actions-inline">
                <div className="dashboard-segmented-toggle" role="tablist" aria-label="Metrica de eficiencia">
                  <button
                    type="button"
                    className={efficiencyView === "lead" ? "is-active" : ""}
                    role="tab"
                    aria-selected={efficiencyView === "lead"}
                    onClick={() => setEfficiencyView("lead")}
                  >
                    Conclusao
                  </button>
                  <button
                    type="button"
                    className={efficiencyView === "cycle" ? "is-active" : ""}
                    role="tab"
                    aria-selected={efficiencyView === "cycle"}
                    onClick={() => setEfficiencyView("cycle")}
                  >
                    Andamento
                  </button>
                </div>
                <Badge variant="muted">
                  media {efficiencyAverage.toFixed(1)}d {formatTrendLabel(efficiencyTrend, { invertMeaning: true }) || ""}
                </Badge>
              </div>
            }
          >
            <div className="dashboard-stat-grid dashboard-stat-grid--inside">
              <MetricTile
                label="Tempo médio para concluir "
                value={`${derived.averageLeadTime.toFixed(1)}d`}
                caption=" Itens concluidos"
                tone="warning"
              />
              <MetricTile
                label="Tempo médio em andamento "
                value={`${derived.averageCycleTime.toFixed(1)}d`}
                caption=" Itens ativos/finalizados"
                tone="info"
              />
            </div>

            {efficiencySeries.length < 2 ? (
              <DashboardEmptyState
                title="Dados insuficientes para historico consistente"
                description="Aguardando mais itens com datas validas para plotar tendencia de eficiencia."
                compact
              />
            ) : (
              <div className="dashboard-chart dashboard-chart--compact">
                <ResponsiveContainer width="100%" height={232}>
                  <LineChart data={efficiencySeries} margin={{ top: 8, right: 10, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(value) => formatDateOnly(value)}
                      tick={CHART_AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: CHART_AXIS_COLOR }}
                    />
                    <YAxis
                      tick={CHART_AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      label={{
                        value: "Dias",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#9fb3d0",
                        fontSize: 11,
                        dx: -2,
                      }}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                    <ReferenceLine
                      y={efficiencyAverage}
                      stroke="rgba(255,255,255,.22)"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgDays"
                      name={efficiencyModeMeta.seriesName}
                      stroke={efficiencyModeMeta.color}
                      strokeWidth={2.6}
                      dot={{ r: 2, fill: efficiencyModeMeta.color }}
                      activeDot={{ r: 4, fill: efficiencyModeMeta.color, stroke: "#071019" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="dashboard-note">{efficiencyModeMeta.caption}</div>
          </ChartCard>
        </div>
      </section>

      <section className="dashboard-section" aria-label="Estrutura do trabalho">
        <SectionHead
          title="Estrutura do trabalho"
          subtitle="Concentracao por status, prioridade e distribuicao de carga por responsavel."
        />

        <div className="dashboard-grid dashboard-grid--two">
          <ChartCard
            title={structureChartModeMeta.title}
            subtitle={structureChartModeMeta.subtitle}
            actions={
              <div className="dashboard-card-actions-inline">
                <div className="dashboard-segmented-toggle" role="tablist" aria-label="Modo estrutura">
                  <button
                    type="button"
                    className={structureView === "status" ? "is-active" : ""}
                    role="tab"
                    aria-selected={structureView === "status"}
                    onClick={() => setStructureView("status")}
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    className={structureView === "wip_columns" ? "is-active" : ""}
                    role="tab"
                    aria-selected={structureView === "wip_columns"}
                    onClick={() => setStructureView("wip_columns")}
                  >
                    WIP por coluna
                  </button>
                </div>
                <Badge variant="muted">{structureChartModeMeta.badge}</Badge>
              </div>
            }
          >
            {structureChartModeMeta.data.length === 0 ? (
              <DashboardEmptyState title={structureChartModeMeta.emptyTitle} compact />
            ) : (
              <div className="dashboard-chart dashboard-chart--compact">
                {structureView === "status" ? (
                  <ResponsiveContainer width="100%" height={232}>
                    <PieChart>
                      <Tooltip content={<ChartTooltip />} />
                      <Pie
                        data={structureChartModeMeta.data}
                        dataKey="count"
                        nameKey="fullStatus"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="rgba(255,255,255,.06)"
                        strokeWidth={1}
                      >
                        {structureChartModeMeta.data.map((entry: any) => (
                          <Cell key={entry.fullStatus} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={232}>
                    <BarChart
                      layout="vertical"
                      data={structureChartModeMeta.data}
                      margin={{ top: 6, right: 12, left: 6, bottom: 0 }}
                      barCategoryGap={12}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
                      <XAxis type="number" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="status" width={124} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                      <Bar dataKey="count" name="Itens" radius={[0, 8, 8, 0]}>
                        {structureChartModeMeta.data.map((entry: any) => (
                          <Cell key={entry.fullStatus} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
            {structureView === "status" && structureChartModeMeta.data.length > 0 ? (
              <div className="dashboard-status-legend">
                {structureChartModeMeta.data.slice(0, 6).map((entry: any) => (
                  <div key={entry.fullStatus} className="dashboard-status-legend__item">
                    <span className="dashboard-status-legend__dot" style={{ background: entry.color }} />
                    <span className="dashboard-status-legend__label">{entry.fullStatus}</span>
                    <strong className="dashboard-status-legend__value">{entry.count}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </ChartCard>

          <ChartCard
            title="Distribuicao por prioridade"
            subtitle="Verifica concentracao excessiva em itens de alta prioridade"
            actions={<Badge variant="muted">{priorityChartData.length} faixas</Badge>}
          >
            {priorityChartData.length === 0 ? (
              <DashboardEmptyState title="Sem dados de prioridade" compact />
            ) : (
              <div className="dashboard-chart dashboard-chart--compact">
                <ResponsiveContainer width="100%" height={232}>
                  <BarChart data={priorityChartData} barCategoryGap={14} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                    <XAxis dataKey="priority" tick={CHART_AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_AXIS_COLOR }} />
                    <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                    <Bar dataKey="count" name="Itens" radius={[8, 8, 0, 0]}>
                      {priorityChartData.map((entry) => (
                        <Cell key={entry.fullPriority} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Itens por pessoa (WIP)"
          subtitle="Carga de trabalho por responsavel, ordenada por maior WIP"
          actions={<Badge variant="muted">{peopleWipChartData.length} pessoas</Badge>}
        >
          {peopleWipChartData.length === 0 ? (
            <DashboardEmptyState title="Sem WIP por pessoa" compact />
          ) : (
            <>
              <div className="dashboard-chart dashboard-chart--compact">
                <ResponsiveContainer width="100%" height={248}>
                  <BarChart
                    layout="vertical"
                    data={peopleWipChartData}
                    margin={{ top: 8, right: 12, left: 6, bottom: 0 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
                    <XAxis type="number" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="assignee" width={140} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                    <Bar dataKey="wip" name="WIP" radius={[0, 8, 8, 0]}>
                      {peopleWipChartData.map((entry) => (
                        <Cell key={entry.fullAssignee} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rank-list dashboard-tv-hide">
                {peopleWipChartData.slice(0, 4).map((person) => (
                  <div key={person.fullAssignee} className="rank-list__row">
                    <div className="rank-list__meta">
                      <div className="rank-list__title">{person.fullAssignee}</div>
                      <div className="rank-list__subtitle">
                        {person.wip} WIP / {person.total} total / {person.blocked} bloqueados
                      </div>
                    </div>
                    <div className="rank-list__metric">
                      <strong>{person.loadPct.toFixed(0)}%</strong>
                    </div>
                    <div className="rank-list__bar">
                      <span style={{ width: `${Math.min(100, person.loadPct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </section>


      <section className="dashboard-section dashboard-section--people" aria-label="Pessoas">
        <SectionHead
          title="Pessoas (sob demanda)"
          subtitle="Selecione uma pessoa e carregue apenas metricas e tarefas do responsavel escolhido."
        />

        <div className="dashboard-person-layout">
          <PersonSelector
            options={derived.personOptions}
            value={selectedPerson}
            onChange={setSelectedPerson}
            disabled={loading}
          />

          <PersonDetailsPanel
            assignee={selectedPerson}
            issues={selectedPersonIssues}
            jiraBaseUrl={jiraBaseUrl}
            onOpenIssueDetails={handleOpenIssueDetails}
            onOpenIssuesFiltered={handleOpenIssuesFiltered}
          />
        </div>
      </section>
    </div>
  );
}

function persistIssuesPrefill(prefill: {
  assignee?: string;
  text?: string;
  status?: string;
  priority?: string;
  labels?: string;
}) {
  const payload = Object.fromEntries(
    Object.entries(prefill).filter(([, value]) => typeof value === "string" && value.trim())
  );

  if (Object.keys(payload).length === 0) {
    localStorage.removeItem("jqcc.issues.prefill");
    return;
  }

  localStorage.setItem(
    "jqcc.issues.prefill",
    JSON.stringify({
      ...payload,
      created_at: Date.now(),
    })
  );
}

