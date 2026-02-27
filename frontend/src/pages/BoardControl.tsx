import { useState } from "react";
import { apiFetch } from "../lib/api";
import { Badge, Button, Card, EmptyState } from "../components/ui";

type JiraLookupUser = {
  account_id: string;
  display_name: string;
  email?: string;
};

type Transition = { id: string; name: string };

export default function BoardControl() {
  const [createSummary, setCreateSummary] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLabels, setCreateLabels] = useState("");
  const [createAssignee, setCreateAssignee] = useState("");
  const [createIssueType, setCreateIssueType] = useState("Tarefa");
  const [createPriority, setCreatePriority] = useState("");
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [issueKey, setIssueKey] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [transitionId, setTransitionId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<JiraLookupUser[]>([]);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const handleCreate = async () => {
    setCreateResult(null);
    setCreating(true);
    try {
      const payload = {
        summary: createSummary,
        description: createDescription || undefined,
        labels: createLabels ? createLabels.split(",").map((l) => l.trim()).filter(Boolean) : undefined,
        assignee_id: createAssignee || undefined,
        issue_type: createIssueType || undefined,
        priority: createPriority || undefined,
      };
      const resp = await apiFetch<{ key?: string }>("/issues", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateResult(`Issue criada: ${resp.key || "OK"}`);
      setCreateSummary("");
      setCreateDescription("");
      setCreateLabels("");
    } catch (err) {
      setCreateResult(err instanceof Error ? err.message : "Falha ao criar issue.");
    } finally {
      setCreating(false);
    }
  };

  const loadTransitions = async () => {
    setMessage(null);
    setBusyAction("transitions");
    try {
      const resp = await apiFetch<Transition[]>(`/issues/${issueKey}/transitions`);
      setTransitions(resp);
      if (resp.length) {
        setTransitionId(resp[0].id);
        setMessage("Transições carregadas.");
      } else {
        setMessage("Nenhuma transição disponível para a issue.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao buscar transições.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleComment = async () => {
    setMessage(null);
    setBusyAction("comment");
    try {
      await apiFetch(`/issues/${issueKey}/comment`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      });
      setMessage("Comentário adicionado.");
      setCommentBody("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao comentar.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleTransition = async () => {
    setMessage(null);
    setBusyAction("transition");
    try {
      await apiFetch(`/issues/${issueKey}/transition`, {
        method: "POST",
        body: JSON.stringify({ transition_id: transitionId }),
      });
      setMessage("Transição aplicada.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao transicionar.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAssign = async () => {
    setMessage(null);
    setBusyAction("assign");
    try {
      await apiFetch(`/issues/${issueKey}/assignee`, {
        method: "PATCH",
        body: JSON.stringify({ account_id: assigneeId }),
      });
      setMessage("Responsável atualizado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao atualizar responsável.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleUserSearch = async () => {
    setUserMessage(null);
    setSearchingUsers(true);
    try {
      const resp = await apiFetch<{ available: boolean; message?: string; users: JiraLookupUser[] }>(
        `/jira/users/search?query=${encodeURIComponent(userQuery)}`
      );
      if (!resp.available) {
        setUserMessage(resp.message || "Ação indisponível.");
        setUserResults([]);
        return;
      }
      setUserResults(resp.users || []);
      if (!resp.users?.length) setUserMessage("Nenhum usuário encontrado.");
    } catch (err) {
      setUserMessage(err instanceof Error ? err.message : "Falha ao buscar usuários.");
    } finally {
      setSearchingUsers(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div className="dashboard-hero__eyebrow">Controle do Board</div>
          <h2 className="dashboard-hero__title">Operações Jira sem sair do painel</h2>
          <p className="dashboard-hero__subtitle">
            Crie issues, busque responsáveis, comente, mova status e reatribua com fluxo guiado.
          </p>
        </div>
      </section>

      <div className="dashboard-grid-2">
        <Card
          title="Criar issue"
          subtitle="Usa o projeto configurado nas Configurações do app"
          actions={<Badge variant="info">MVP</Badge>}
        >
          <div className="form-grid form-grid--2">
            <Field label="Resumo" wide>
              <input value={createSummary} onChange={(e) => setCreateSummary(e.target.value)} />
            </Field>
            <Field label="Descrição" wide>
              <textarea
                rows={5}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </Field>
            <Field label="Labels (vírgula)">
              <input value={createLabels} onChange={(e) => setCreateLabels(e.target.value)} />
            </Field>
            <Field label="Responsável (accountId)">
              <input value={createAssignee} onChange={(e) => setCreateAssignee(e.target.value)} />
            </Field>
            <Field label="Tipo">
              <input value={createIssueType} onChange={(e) => setCreateIssueType(e.target.value)} />
            </Field>
            <Field label="Prioridade">
              <input value={createPriority} onChange={(e) => setCreatePriority(e.target.value)} />
            </Field>
          </div>
          <div className="toolbar-row">
            <div className="toolbar-row__hint">
              Dica: use a busca de usuários ao lado para preencher <code>accountId</code>.
            </div>
            <div className="toolbar-row__actions">
              <Button
                iconLeft="bolt"
                onClick={handleCreate}
                loading={creating}
                disabled={!createSummary.trim()}
              >
                Criar issue
              </Button>
            </div>
          </div>
          {createResult ? <div className="notice">{createResult}</div> : null}
        </Card>

        <Card title="Buscar usuários no Jira" subtitle="Autocomplete / lookup de accountId (se permitido)">
          <div className="toolbar-row">
            <div className="top-search top-search--inside">
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Nome ou e-mail do usuário"
              />
            </div>
            <Button
              variant="ghost"
              iconLeft="search"
              onClick={handleUserSearch}
              loading={searchingUsers}
              disabled={!userQuery.trim()}
            >
              Buscar
            </Button>
          </div>

          {userMessage ? <div className="notice">{userMessage}</div> : null}

          {userResults.length === 0 ? (
            <EmptyState
              compact
              title="Sem resultados ainda"
              description="Faça uma busca para preencher o accountId de criação/atribuição."
            />
          ) : (
            <div className="table">
              <div className="table-row table-header table-row--users-premium">
                <span>Nome</span>
                <span>E-mail</span>
                <span>AccountId</span>
                <span>Ação</span>
              </div>
              {userResults.map((user) => (
                <div key={user.account_id} className="table-row table-row--users-premium">
                  <span>{user.display_name}</span>
                  <span>{user.email || "-"}</span>
                  <span className="mono truncate">{user.account_id}</span>
                  <span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCreateAssignee(user.account_id);
                        setAssigneeId(user.account_id);
                      }}
                    >
                      Usar
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Ações em issue existente" subtitle="Fluxo recomendado: carregar transições → comentar / mover / reatribuir">
        <div className="form-grid form-grid--3">
          <Field label="Issue Key">
            <input
              value={issueKey}
              onChange={(e) => setIssueKey(e.target.value.toUpperCase())}
              placeholder="KAN-123"
            />
          </Field>
          <Field label="Transição">
            <select value={transitionId} onChange={(e) => setTransitionId(e.target.value)}>
              <option value="">{transitions.length ? "Selecione" : "Carregue transições"}</option>
              {transitions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Novo responsável (accountId)">
            <input value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
          </Field>
          <Field label="Comentário" wide>
            <textarea
              rows={4}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Escreva um comentário para a issue..."
            />
          </Field>
        </div>

        <div className="toolbar-row toolbar-row--spread">
          <div className="toolbar-row__hint">
            {message || "Use as ações abaixo para operar a issue selecionada."}
          </div>
          <div className="toolbar-row__actions">
            <Button
              variant="ghost"
              iconLeft="sync"
              onClick={loadTransitions}
              loading={busyAction === "transitions"}
              disabled={!issueKey.trim()}
            >
              Transições
            </Button>
            <Button
              variant="ghost"
              onClick={handleComment}
              loading={busyAction === "comment"}
              disabled={!issueKey.trim() || !commentBody.trim()}
            >
              Comentar
            </Button>
            <Button
              onClick={handleTransition}
              loading={busyAction === "transition"}
              disabled={!issueKey.trim() || !transitionId}
            >
              Transicionar
            </Button>
            <Button
              variant="secondary"
              onClick={handleAssign}
              loading={busyAction === "assign"}
              disabled={!issueKey.trim() || !assigneeId.trim()}
            >
              Reatribuir
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "field--wide" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
