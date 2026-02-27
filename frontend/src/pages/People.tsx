import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { formatDateTime, clampText } from "../lib/format";
import { getStatusTone } from "../lib/status";
import { onGlobalSyncDone } from "../lib/uiEvents";
import { JiraTeamOverview, TeamMember } from "../lib/types";
import SectionHead from "../components/dashboard/SectionHead";
import { Badge, Button, Card, EmptyState, KpiCard, SkeletonTable, TooltipHint } from "../components/ui";

const emptyJiraOverview: JiraTeamOverview = {
  available: false,
  total_issues: 0,
  member_count: 0,
  members: [],
};

type ViewMode = "jira" | "internal";
type JiraSortMode = "critical" | "wip" | "done" | "name";

export default function People() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingInternal, setLoadingInternal] = useState(false);

  const [jiraOverview, setJiraOverview] = useState<JiraTeamOverview>(emptyJiraOverview);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraAutoRefresh, setJiraAutoRefresh] = useState(true);
  const [jiraLastLoadAt, setJiraLastLoadAt] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("jira");
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([]);
  const [tasksPerPerson, setTasksPerPerson] = useState(4);
  const [maxCards, setMaxCards] = useState(8);
  const [jiraSortMode, setJiraSortMode] = useState<JiraSortMode>("critical");

  const loadMembers = async () => {
    setLoadingInternal(true);
    try {
      const resp = await apiFetch<TeamMember[]>("/team-members");
      setMembers(resp);
    } catch (err) {
      setMembers([]);
      setMessage(err instanceof Error ? err.message : "Falha ao carregar equipe interna.");
    } finally {
      setLoadingInternal(false);
    }
  };

  const loadJiraOverview = async () => {
    setJiraLoading(true);
    try {
      const resp = await apiFetch<JiraTeamOverview>("/team-members/jira/overview?tasks_per_member=8&max_issues=300");
      setJiraOverview(resp);
      setJiraLastLoadAt(new Date());
    } catch (err) {
      setJiraOverview({
        ...emptyJiraOverview,
        message: err instanceof Error ? err.message : "Falha ao carregar equipe do Jira.",
      });
    } finally {
      setJiraLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
    void loadJiraOverview();
  }, []);

  useEffect(() => onGlobalSyncDone(() => void loadJiraOverview()), []);

  useEffect(() => {
    if (!jiraAutoRefresh) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadJiraOverview();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [jiraAutoRefresh]);

  const handleCreate = async () => {
    setMessage(null);
    try {
      await apiFetch<TeamMember>("/team-members", {
        method: "POST",
        body: JSON.stringify({ name, email, area, active: true }),
      });
      setName("");
      setEmail("");
      setArea("");
      setMessage("Membro interno salvo com sucesso.");
      await loadMembers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar membro.");
    }
  };

  const toggleActive = async (member: TeamMember) => {
    setMessage(null);
    try {
      await apiFetch<TeamMember>(`/team-members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !member.active }),
      });
      await loadMembers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao atualizar membro.");
    }
  };

  const localStats = useMemo(() => {
    const active = members.filter((m) => m.active).length;
    const inactive = members.length - active;
    const areas = new Set(members.map((m) => m.area || "").filter(Boolean)).size;
    return { total: members.length, active, inactive, areas };
  }, [members]);

  const jiraStats = useMemo(() => {
    const inProgress = jiraOverview.members.reduce((acc, m) => acc + m.in_progress, 0);
    const done = jiraOverview.members.reduce((acc, m) => acc + m.done, 0);
    const planned = jiraOverview.members.reduce((acc, m) => acc + m.planned, 0);
    return { inProgress, done, planned };
  }, [jiraOverview]);

  useEffect(() => {
    if (!selectedPeopleIds.length) return;
    const validIds = new Set(jiraOverview.members.map((m) => getJiraMemberId(m)));
    setSelectedPeopleIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [jiraOverview.members, selectedPeopleIds.length]);

  const jiraMemberOptions = useMemo(
    () =>
      jiraOverview.members
        .map((member) => ({
          id: getJiraMemberId(member),
          name: member.display_name,
          total: member.total_issues,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [jiraOverview.members]
  );

  const jiraMembersFiltered = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    const selected = new Set(selectedPeopleIds);
    const ranked = jiraOverview.members
      .map((member) => {
        const criticalCount = member.tasks.filter((t) => {
          const tone = getStatusTone(t.status, t.labels);
          return tone === "blocked" || tone === "progress";
        }).length;
        return { member, criticalCount };
      })
      .filter(({ member }) => {
        if (selected.size && !selected.has(getJiraMemberId(member))) return false;
        if (!query) return true;
        const haystack = [member.display_name, member.email, member.account_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (jiraSortMode === "name") return a.member.display_name.localeCompare(b.member.display_name);
        if (jiraSortMode === "done") return b.member.done - a.member.done || b.member.total_issues - a.member.total_issues;
        if (jiraSortMode === "wip") return b.member.in_progress - a.member.in_progress || b.criticalCount - a.criticalCount;
        return b.criticalCount - a.criticalCount || b.member.in_progress - a.member.in_progress;
      });

    return (maxCards > 0 ? ranked.slice(0, maxCards) : ranked).map(({ member, criticalCount }) => ({
      member,
      criticalCount,
    }));
  }, [jiraOverview.members, jiraSortMode, maxCards, personSearch, selectedPeopleIds]);

  const toggleSelectedPerson = (id: string) => {
    setSelectedPeopleIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  return (
    <div className="page-stack">
      <section className="dashboard-section">
        <SectionHead
          title="Pessoas"
          subtitle="Carga por responsavel no Jira e cadastro interno."
          actions={
            <div className="dashboard-inline-meta">
              <Button
                variant="ghost"
                size="sm"
                iconLeft="dashboard"
                onClick={() => navigate("/")}
                className="dashboard-inline-nav-btn"
                title="Ir para Visao Geral"
              >
                Visao Geral
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
              <Badge variant={jiraOverview.available ? "done" : "warning"}>
                Jira {jiraOverview.available ? "conectado" : "indisponivel"}
              </Badge>
              <Badge variant="muted">Atualizado {formatDateTime(jiraLastLoadAt?.toISOString())}</Badge>
              <label className="dashboard-inline-toggle" title="Atualizar automaticamente a visao de pessoas">
                <input
                  type="checkbox"
                  checked={jiraAutoRefresh}
                  onChange={(event) => setJiraAutoRefresh(event.target.checked)}
                />
                <span>Auto (45s)</span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                iconLeft="sync"
                loading={jiraLoading}
                onClick={loadJiraOverview}
                className="dashboard-inline-nav-btn"
              >
                Atualizar
              </Button>
            </div>
          }
        />
      </section>

      <div className="dashboard-kpi-grid dashboard-kpi-grid--compact">
        <KpiCard label="Pessoas (Jira)" value={jiraOverview.member_count || 0} tone="neutral" />
        <KpiCard label="Issues (Jira)" value={jiraOverview.total_issues || 0} tone="neutral" />
        <KpiCard label="Em andamento" value={jiraStats.inProgress} tone="progress" />
        <KpiCard label="Concluídas" value={jiraStats.done} tone="done" />
        <KpiCard label="Planejadas" value={jiraStats.planned} tone="planned" />
        <KpiCard label="Membros internos" value={localStats.total} tone="neutral" />
      </div>

      <div className="segmented segmented--tabs">
        <button className={viewMode === "jira" ? "is-active" : ""} onClick={() => setViewMode("jira")}>
          Equipe Jira
        </button>
        <button className={viewMode === "internal" ? "is-active" : ""} onClick={() => setViewMode("internal")}>
          Cadastro interno
        </button>
      </div>

      {viewMode === "jira" ? (
        <>
          <Card
            title={
              <span className="ui-title-inline">
                Visão por responsável (Jira)
                <TooltipHint text="Agrupamento baseado nas issues retornadas pela JQL configurada. Não representa todo o tenant Jira." />
              </span>
            }
            subtitle="Cards por pessoa com WIP, concluídas e tarefas recentes"
            actions={<Badge variant="muted">{jiraOverview.member_count || 0} pessoas</Badge>}
          >
            {jiraOverview.message ? <div className="notice">{jiraOverview.message}</div> : null}

            <div className="people-filter-toolbar">
              <div className="form-grid form-grid--3">
                <Field label="Buscar pessoa">
                  <input
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Nome, e-mail ou accountId"
                  />
                </Field>
                <Field label="Tarefas por pessoa">
                  <select
                    value={String(tasksPerPerson)}
                    onChange={(e) => setTasksPerPerson(Number(e.target.value))}
                  >
                    <option value="3">3 tarefas</option>
                    <option value="4">4 tarefas</option>
                    <option value="6">6 tarefas</option>
                    <option value="8">8 tarefas</option>
                  </select>
                </Field>
                <Field label="Maximo de cards">
                  <select value={String(maxCards)} onChange={(e) => setMaxCards(Number(e.target.value))}>
                    <option value="4">4 pessoas</option>
                    <option value="8">8 pessoas</option>
                    <option value="12">12 pessoas</option>
                    <option value="0">Todas</option>
                  </select>
                </Field>
              </div>

              <div className="toolbar-row toolbar-row--spread">
                <div className="toolbar-row__hint">
                  Selecione quem deve aparecer para evitar excesso de cards e manter foco no grupo analisado.
                </div>
                <div className="toolbar-row__actions">
                  <div className="segmented">
                    <button
                      className={jiraSortMode === "critical" ? "is-active" : ""}
                      onClick={() => setJiraSortMode("critical")}
                    >
                      Criticas
                    </button>
                    <button
                      className={jiraSortMode === "wip" ? "is-active" : ""}
                      onClick={() => setJiraSortMode("wip")}
                    >
                      WIP
                    </button>
                    <button
                      className={jiraSortMode === "done" ? "is-active" : ""}
                      onClick={() => setJiraSortMode("done")}
                    >
                      Concluidas
                    </button>
                    <button
                      className={jiraSortMode === "name" ? "is-active" : ""}
                      onClick={() => setJiraSortMode("name")}
                    >
                      Nome
                    </button>
                  </div>
                  {selectedPeopleIds.length ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelectedPeopleIds([])}>
                      Limpar selecao
                    </Button>
                  ) : null}
                </div>
              </div>

              {jiraMemberOptions.length ? (
                <div className="people-selector">
                  {jiraMemberOptions.map((option) => {
                    const active = selectedPeopleIds.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`people-selector__chip ${active ? "is-active" : ""}`.trim()}
                        onClick={() => toggleSelectedPerson(option.id)}
                        aria-pressed={active}
                      >
                        <span>{option.name}</span>
                        <i>{option.total}</i>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {jiraLoading && jiraOverview.members.length === 0 ? (
              <SkeletonTable rows={6} />
            ) : !jiraOverview.available ? (
              <EmptyState
                title="Equipe Jira indisponível"
                description="Verifique credenciais e JQL em Configurações."
              />
            ) : jiraOverview.members.length === 0 ? (
              <EmptyState title="Sem responsáveis nas issues atuais" compact />
            ) : jiraMembersFiltered.length === 0 ? (
              <EmptyState
                title="Nenhuma pessoa corresponde ao filtro"
                description="Ajuste busca, selecao manual ou o limite de cards."
                compact
              />
            ) : (
              <div className="people-jira-grid premium">
                {jiraMembersFiltered.map(({ member: person, criticalCount }) => {
                  return (
                    <div key={person.account_id || person.display_name} className="person-card premium">
                      <div className="person-card__header">
                        <div>
                          <div className="person-card__name">{person.display_name}</div>
                          <div className="person-card__meta">
                            {person.email || person.account_id || "Sem identificador"}
                          </div>
                        </div>
                        <Badge variant="info">{person.total_issues} issues</Badge>
                      </div>

                      <div className="person-card__stats-grid">
                        <MetricPill label="WIP" value={person.in_progress} tone="progress" />
                        <MetricPill label="Concluídas" value={person.done} tone="done" />
                        <MetricPill label="Planejadas" value={person.planned} tone="planned" />
                        <MetricPill label="Críticas" value={criticalCount} tone={criticalCount ? "blocked" : "muted"} />
                      </div>

                      <div className="person-card__tasks">
                        {person.tasks.length === 0 ? (
                          <EmptyState title="Sem tarefas recentes" compact />
                        ) : (
                          person.tasks.slice(0, tasksPerPerson).map((task) => (
                            <div key={task.key} className="person-task premium">
                              <div className="person-task__head">
                                <span className="mono">{task.key}</span>
                                <Badge variant={getStatusTone(task.status, task.labels) as any}>
                                  {task.status || "-"}
                                </Badge>
                              </div>
                              <div className="person-task__summary">{clampText(task.summary, 95)}</div>
                              <div className="person-task__meta">
                                <span>{task.issue_type || "-"}</span>
                                <span>{task.priority || "-"}</span>
                                <span>{formatDateTime(task.updated_at, false)}</span>
                              </div>
                              {task.labels?.length ? (
                                <div className="issue-labels">
                                  {task.labels.slice(0, 4).map((label) => (
                                    <Badge key={label} variant="muted">
                                      {label}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="dashboard-grid-2">
            <Card title="Cadastro interno" subtitle="Gestão local de pessoas/matérias (não altera Jira)">
              <div className="form-grid form-grid--3">
                <Field label="Nome">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="E-mail">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Área / Matéria">
                  <input value={area} onChange={(e) => setArea(e.target.value)} />
                </Field>
              </div>
              <div className="toolbar-row toolbar-row--spread">
                <div className="toolbar-row__hint">
                  Use este cadastro para organização interna e futuras metas por pessoa.
                </div>
                <div className="toolbar-row__actions">
                  <Button iconLeft="people" onClick={handleCreate} disabled={!name.trim()}>
                    Salvar membro
                  </Button>
                </div>
              </div>
              {message ? <div className="notice">{message}</div> : null}
            </Card>

            <Card title="Resumo do cadastro interno" subtitle="Leitura rápida da base local">
              <div className="mini-stats-grid">
                <StatBox label="Total" value={localStats.total} />
                <StatBox label="Ativos" value={localStats.active} />
                <StatBox label="Inativos" value={localStats.inactive} />
                <StatBox label="Áreas" value={localStats.areas} />
              </div>
              <div className="checklist">
                <div className="checklist__item">Padronize nomes e áreas para relatórios comparativos.</div>
                <div className="checklist__item">Prefira inativar em vez de excluir para preservar histórico.</div>
                <div className="checklist__item">Combine com a visão Jira para monitoramento por responsável.</div>
              </div>
            </Card>
          </div>

          <Card title="Equipe interna cadastrada" subtitle="CRUD interno do app">
            {loadingInternal ? (
              <SkeletonTable rows={5} />
            ) : members.length === 0 ? (
              <EmptyState title="Nenhum membro cadastrado" compact />
            ) : (
              <div className="table table--people-premium">
                <div className="table-row table-header table-row--people-premium">
                  <span>Nome</span>
                  <span>E-mail</span>
                  <span>Área</span>
                  <span>Status</span>
                  <span>Ação</span>
                </div>
                {members.map((member) => (
                  <div key={member.id} className="table-row table-row--people-premium">
                    <span>{member.name}</span>
                    <span>{member.email || "-"}</span>
                    <span>{member.area || "-"}</span>
                    <span>
                      <Badge variant={member.active ? "done" : "muted"}>
                        {member.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </span>
                    <span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleActive(member)}
                      >
                        {member.active ? "Inativar" : "Ativar"}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "progress" | "done" | "planned" | "blocked" | "muted";
}) {
  return (
    <div className={`metric-pill metric-pill--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-box">
      <div className="stat-box__label">{label}</div>
      <div className="stat-box__value">{value}</div>
    </div>
  );
}

function getJiraMemberId(member: {
  account_id?: string | null;
  display_name: string;
  email?: string | null;
}) {
  return member.account_id || member.email || member.display_name;
}


