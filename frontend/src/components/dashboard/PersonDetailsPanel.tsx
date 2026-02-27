import { useMemo } from "react";
import { Issue } from "../../lib/types";
import { clampText, daysSince, formatDateTime } from "../../lib/format";
import {
  isBlocked,
  isLikelyDoneStatus,
  isLikelyInProgressStatus,
  priorityWeight,
} from "../../lib/status";
import { Badge, Button, Card } from "../ui";
import StatusBadge from "./StatusBadge";
import EmptyState from "./EmptyState";

type PersonSummary = {
  total: number;
  inProgress: number;
  done: number;
  planned: number;
  averageAging: number;
  blockedPct: number;
  throughput14d: number;
  throughput30d: number;
};

export default function PersonDetailsPanel({
  assignee,
  issues,
  jiraBaseUrl,
  onOpenIssueDetails,
  onOpenIssuesFiltered,
}: {
  assignee: string;
  issues: Issue[];
  jiraBaseUrl?: string | null;
  onOpenIssueDetails: (issueKey: string) => void;
  onOpenIssuesFiltered: (assignee?: string | null) => void;
}) {
  const { summary, rankedTasks } = useMemo(() => {
    const ranked = issues
      .map((issue) => {
        const aging = daysSince(issue.updated_at || issue.created_at);
        const blocked = isBlocked(issue.labels || []);
        const inProgress = isLikelyInProgressStatus(issue.status);
        const done = isLikelyDoneStatus(issue.status);

        return {
          ...issue,
          aging,
          blocked,
          inProgress,
          done,
          score:
            (blocked ? 1000 : 0) +
            (inProgress ? 240 : 0) +
            priorityWeight(issue.priority) * 18 +
            aging,
        };
      })
      .sort((a, b) => b.score - a.score);

    let inProgress = 0;
    let done = 0;
    let planned = 0;
    let blocked = 0;
    let agingSum = 0;
    let agingCount = 0;
    let throughput14d = 0;
    let throughput30d = 0;

    for (const item of ranked) {
      if (item.blocked) blocked += 1;
      if (item.inProgress) {
        inProgress += 1;
        agingSum += item.aging;
        agingCount += 1;
      } else if (item.done) {
        done += 1;
      } else {
        planned += 1;
      }

      if (item.done) {
        if (item.aging <= 14) throughput14d += 1;
        if (item.aging <= 30) throughput30d += 1;
      }
    }

    const total = ranked.length;
    const personSummary: PersonSummary = {
      total,
      inProgress,
      done,
      planned,
      averageAging: agingCount ? agingSum / agingCount : 0,
      blockedPct: total ? (blocked / total) * 100 : 0,
      throughput14d,
      throughput30d,
    };

    return { summary: personSummary, rankedTasks: ranked.slice(0, 20) };
  }, [issues]);

  if (!assignee) {
    return (
      <Card
        className="person-details-card"
        title="Visao por pessoa"
        subtitle="Selecione uma pessoa para carregar as tarefas"
      >
        <EmptyState
          title="Nenhuma pessoa selecionada"
          description="Escolha um responsavel acima para visualizar indicadores e tarefas."
        />
      </Card>
    );
  }

  if (issues.length === 0) {
    return (
      <Card className="person-details-card" title={assignee} subtitle="Sem tarefas no snapshot">
        <EmptyState
          title="Sem tarefas para esta pessoa"
          description="Selecione outra pessoa ou atualize o snapshot do Jira."
        />
      </Card>
    );
  }

  return (
    <Card
      className="person-details-card"
      title={assignee}
      subtitle="Painel renderizado somente com as tarefas da pessoa selecionada"
      actions={
        <div className="person-details-card__actions">
          <Badge variant="muted">{summary.total} tarefas</Badge>
          <Button variant="ghost" size="sm" iconLeft="filter" onClick={() => onOpenIssuesFiltered(assignee)}>
            Abrir filtro
          </Button>
        </div>
      }
    >
      <div className="person-summary-grid">
        <div className="person-summary-tile">
          <span>Total atribuidas</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="person-summary-tile" data-tone="progress">
          <span>Em andamento</span>
          <strong>{summary.inProgress}</strong>
        </div>
        <div className="person-summary-tile" data-tone="done">
          <span>Concluidas</span>
          <strong>{summary.done}</strong>
        </div>
        <div className="person-summary-tile" data-tone="warn">
          <span>Aging medio (WIP)</span>
          <strong>{summary.averageAging.toFixed(1)}d</strong>
        </div>
        <div className="person-summary-tile">
          <span>Entregas 14d</span>
          <strong>{summary.throughput14d}</strong>
        </div>
        <div className="person-summary-tile" data-tone={summary.blockedPct > 10 ? "danger" : "neutral"}>
          <span>Entregas 30d</span>
          <strong>{summary.throughput30d}</strong>
        </div>
      </div>

      <div className="person-task-list">
        {rankedTasks.map((task) => (
          <div key={task.key} className="person-task-row">
            <div className="person-task-row__main">
              <div className="person-task-row__top">
                <span className="mono">{task.key}</span>
                <StatusBadge status={task.status} labels={task.labels || []} />
                {task.blocked ? <Badge variant="blocked">Bloqueado</Badge> : null}
              </div>
              <div className="person-task-row__title">{clampText(task.summary, 120)}</div>
              <div className="person-task-row__meta">
                <span>Prioridade: {task.priority || "-"}</span>
                <span>Atualizado: {formatDateTime(task.updated_at)}</span>
                <span>Aging: {task.aging}d</span>
              </div>
            </div>

            <div className="person-task-row__actions">
              {jiraBaseUrl ? (
                <a
                  className="inline-link-btn"
                  href={`${jiraBaseUrl}/browse/${task.key}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Jira
                </a>
              ) : null}
              <button className="inline-link-btn" onClick={() => onOpenIssueDetails(task.key)}>
                Detalhes
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
