import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { formatDateTime, daysSince, clampText } from "../lib/format";
import { getStatusTone, isBlocked } from "../lib/status";
import { onGlobalSyncDone, onIssuesSearch } from "../lib/uiEvents";
import { Issue } from "../lib/types";
import { Badge, Button, Card, EmptyState, SkeletonTable } from "../components/ui";

const PAGE_SIZE = 50;
const PREFILL_KEY = "jqcc.issues.prefill";
const PREFILL_TTL_MS = 15 * 60 * 1000;

type IssueResponse = {
  issues: Issue[];
  total: number;
};

type Filters = {
  status: string;
  assignee: string;
  labels: string;
  issueType: string;
  priority: string;
  fromDate: string;
  toDate: string;
  text: string;
};

const defaultFilters: Filters = {
  status: "",
  assignee: "",
  labels: "",
  issueType: "",
  priority: "",
  fromDate: "",
  toDate: "",
  text: "",
};

export default function Issues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadAt, setLastLoadAt] = useState<Date | null>(null);
  const firstLoadRef = useRef(true);

  const loadIssues = async (pageOverride = page, filtersOverride?: Partial<Filters>) => {
    setLoading(true);
    setError(null);
    try {
      const f = { ...filters, ...(filtersOverride || {}) };
      const params = new URLSearchParams();
      if (f.status) params.set("status", f.status);
      if (f.assignee) params.set("assignee", f.assignee);
      if (f.labels) params.set("labels", f.labels);
      if (f.issueType) params.set("issue_type", f.issueType);
      if (f.priority) params.set("priority", f.priority);
      if (f.fromDate) params.set("from", f.fromDate);
      if (f.toDate) params.set("to", f.toDate);
      if (f.text) params.set("text", f.text);
      params.set("start_at", String(pageOverride * PAGE_SIZE));
      params.set("max_results", String(PAGE_SIZE));

      const resp = await apiFetch<IssueResponse>(`/issues?${params.toString()}`);
      setIssues(resp.issues || []);
      setTotal(resp.total || 0);
      setLastLoadAt(new Date());
    } catch (err) {
      setIssues([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Falha ao carregar demandas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      const prefillRaw = localStorage.getItem(PREFILL_KEY);
      if (prefillRaw) {
        try {
          const parsed = JSON.parse(prefillRaw) as Partial<
            Filters & { created_at?: number | string }
          >;
          const createdAt =
            typeof parsed?.created_at === "number"
              ? parsed.created_at
              : Number(parsed?.created_at || 0);

          const isFresh = !createdAt || Date.now() - createdAt <= PREFILL_TTL_MS;

          const next: Filters = {
            ...defaultFilters,
            ...(isFresh
              ? {
                  assignee: typeof parsed?.assignee === "string" ? parsed.assignee : "",
                  text: typeof parsed?.text === "string" ? parsed.text : "",
                  status: typeof parsed?.status === "string" ? parsed.status : "",
                  priority: typeof parsed?.priority === "string" ? parsed.priority : "",
                  labels: typeof parsed?.labels === "string" ? parsed.labels : "",
                }
              : {}),
          };

          const hasPrefill = Object.entries(next).some(
            ([key, value]) => key !== "fromDate" && key !== "toDate" && String(value).trim()
          );

          if (hasPrefill) {
            setFilters(next);
            localStorage.removeItem(PREFILL_KEY);
            void loadIssues(0, next);
            return;
          }
        } catch {
          // invalid prefill payload; fall back to default fetch
        }
        localStorage.removeItem(PREFILL_KEY);
      }
    }
    void loadIssues(page);
  }, [page]);

  useEffect(() => onGlobalSyncDone(() => void loadIssues(page)), [page, filters]);

  useEffect(() => {
    return onIssuesSearch((query) => {
      setFilters((prev) => ({ ...prev, text: query }));
      setPage(0);
      void loadIssues(0, { ...filters, text: query });
    });
  }, [filters, page]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadIssues(page);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, page, filters]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stats = useMemo(() => {
    let blocked = 0;
    let inProgress = 0;
    let aging8plus = 0;
    for (const issue of issues) {
      if (isBlocked(issue.labels)) blocked += 1;
      if (getStatusTone(issue.status, issue.labels) === "progress") inProgress += 1;
      if (daysSince(issue.updated_at) >= 8 && getStatusTone(issue.status, issue.labels) === "progress") {
        aging8plus += 1;
      }
    }
    const activeFilters = Object.values(filters).filter((v) => String(v).trim()).length;
    return { blocked, inProgress, aging8plus, activeFilters };
  }, [issues, filters]);

  const handleApplyFilters = () => {
    setPage(0);
    void loadIssues(0);
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    setPage(0);
    void loadIssues(0, defaultFilters);
  };

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div className="dashboard-hero__eyebrow">Demandas</div>
          <h2 className="dashboard-hero__title">Busca operacional e triagem por filtros</h2>
          <p className="dashboard-hero__subtitle">
            Consulta direta no Jira com atualização contínua para monitoramento e acompanhamento.
          </p>
        </div>
        <div className="dashboard-hero__actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto refresh (30s)</span>
          </label>
          <Button variant="ghost" iconLeft="sync" onClick={() => void loadIssues(page)}>
            Atualizar
          </Button>
        </div>
      </section>

      <div className="dashboard-kpi-grid dashboard-kpi-grid--compact">
        <StatTile label="Total retornado" value={total} />
        <StatTile label="Em andamento" value={stats.inProgress} />
        <StatTile label="Bloqueadas" value={stats.blocked} />
        <StatTile label="Aging 8d+" value={stats.aging8plus} />
        <StatTile label="Filtros ativos" value={stats.activeFilters} />
        <StatTile label="Última leitura" value={lastLoadAt ? formatDateTime(lastLoadAt.toISOString(), false) : "-"} />
      </div>

      {error ? (
        <div className="inline-alert inline-alert--warn">
          <div>{error}</div>
          <div className="inline-alert__actions">
            <Link className="inline-link-btn" to="/settings">
              Configurações
            </Link>
            <button className="inline-link-btn" onClick={() => void loadIssues(page)}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      <Card
        title="Filtros e busca"
        subtitle="Use a busca textual (também integrada ao campo de busca do topo) e filtros por atributos."
        actions={
          <div className="legend-inline">
            <span>
              <i className="legend-inline__dot legend-inline__dot--a" /> Jira ao vivo
            </span>
          </div>
        }
      >
        <div className="filters-grid filters-grid--issues">
          <Field label="Busca textual">
            <input
              value={filters.text}
              onChange={(e) => setFilters((prev) => ({ ...prev, text: e.target.value }))}
              placeholder="Resumo, descrição, texto indexado..."
            />
          </Field>
          <Field label="Status">
            <input
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              placeholder="Planejado, Em andamento..."
            />
          </Field>
          <Field label="Responsável">
            <input
              value={filters.assignee}
              onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))}
              placeholder="Nome ou accountId:xxxx"
            />
          </Field>
          <Field label="Labels">
            <input
              value={filters.labels}
              onChange={(e) => setFilters((prev) => ({ ...prev, labels: e.target.value }))}
              placeholder="blocked, qa..."
            />
          </Field>
          <Field label="Tipo">
            <input
              value={filters.issueType}
              onChange={(e) => setFilters((prev) => ({ ...prev, issueType: e.target.value }))}
              placeholder="Tarefa, Bug..."
            />
          </Field>
          <Field label="Prioridade">
            <input
              value={filters.priority}
              onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
              placeholder="High, Medium..."
            />
          </Field>
          <Field label="Atualizado de">
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
            />
          </Field>
          <Field label="Atualizado até">
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
            />
          </Field>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-row__hint">
            Dica: use <code>accountId:xxxx</code> para filtrar responsável por ID.
          </div>
          <div className="toolbar-row__actions">
            <Button variant="ghost" iconLeft="filter" onClick={handleClearFilters}>
              Limpar
            </Button>
            <Button iconLeft="search" onClick={handleApplyFilters}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Tabela de demandas"
        subtitle={`Página ${page + 1} de ${totalPages} · ${PAGE_SIZE} por página`}
        actions={
          <Badge variant="muted">
            {loading ? "Atualizando..." : `${issues.length} itens na página`}
          </Badge>
        }
      >
        {loading && issues.length === 0 ? (
          <SkeletonTable rows={8} />
        ) : issues.length === 0 ? (
          <EmptyState
            title="Nenhuma demanda encontrada"
            description="Ajuste filtros ou revise a JQL em Configurações."
            action={
              <Link to="/settings">
                <Button variant="ghost" size="sm">
                  Abrir Configurações
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="table table--issues-premium">
              <div className="table-row table-header table-row--issues-premium">
                <span>Issue</span>
                <span>Título</span>
                <span>Responsável</span>
                <span>Status</span>
                <span>Prioridade</span>
                <span>Tipo</span>
                <span>Aging</span>
                <span>Atualizado</span>
              </div>

              {issues.map((issue) => {
                const tone = getStatusTone(issue.status, issue.labels);
                const aging = daysSince(issue.updated_at);
                const blocked = isBlocked(issue.labels);
                return (
                  <div key={issue.key} className="table-row table-row--issues-premium">
                    <span className="mono">{issue.key}</span>
                    <span className="issue-cell">
                      <strong>{clampText(issue.summary, 80)}</strong>
                      <div className="issue-cell__meta">
                        {issue.labels?.slice(0, 3).map((label) => (
                          <Badge key={label} variant="muted">
                            {label}
                          </Badge>
                        ))}
                        {blocked ? <Badge variant="blocked">Bloqueado</Badge> : null}
                      </div>
                    </span>
                    <span>{issue.assignee || "-"}</span>
                    <span>
                      <Badge variant={tone as any}>{issue.status || "-"}</Badge>
                    </span>
                    <span>{issue.priority || "-"}</span>
                    <span>{issue.issue_type || "-"}</span>
                    <span>
                      <Badge variant={aging >= 8 ? "warning" : "muted"}>{aging}d</Badge>
                    </span>
                    <span>{formatDateTime(issue.updated_at, false)}</span>
                  </div>
                );
              })}
            </div>

            <div className="pagination pagination--premium">
              <Button
                variant="ghost"
                size="sm"
                iconLeft="chevron-left"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
              >
                Anterior
              </Button>
              <div className="pagination__center">
                Página <strong>{page + 1}</strong> de <strong>{totalPages}</strong>
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconRight="chevron-right"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value">{value}</div>
    </div>
  );
}
