import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { JiraConnectionStatus } from "../lib/types";
import SectionHead from "../components/dashboard/SectionHead";
import { Badge, Button, Card } from "../components/ui";

export default function Settings() {
  const navigate = useNavigate();
  const [projectKey, setProjectKey] = useState("");
  const [boardId, setBoardId] = useState("");
  const [jqlBase, setJqlBase] = useState("");
  const [statusMapping, setStatusMapping] = useState("{}");
  const [agingDays, setAgingDays] = useState("5");
  const [message, setMessage] = useState<string | null>(null);

  const [connection, setConnection] = useState<JiraConnectionStatus | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningSnapshot, setRunningSnapshot] = useState(false);

  const loadSettings = async () => {
    try {
      const resp = await apiFetch<any>("/settings/jira");
      setProjectKey(resp?.project_key || "");
      setBoardId(resp?.board_id || "");
      setJqlBase(resp?.jql_base || "");
      setStatusMapping(JSON.stringify(resp?.status_mapping || {}, null, 2));
      setAgingDays(String(resp?.aging_days_threshold || 5));
    } catch {
      setMessage("Nao foi possivel carregar as configuracoes.");
    }
  };

  const loadConnectionStatus = async () => {
    setConnectionLoading(true);
    try {
      const resp = await apiFetch<JiraConnectionStatus>("/settings/jira/connection-test");
      setConnection(resp);
    } catch (err) {
      setConnection({
        env_configured: false,
        base_url_configured: false,
        email_configured: false,
        api_token_configured: false,
        auth_ok: false,
        jql_ok: false,
        warnings: [],
        message: err instanceof Error ? err.message : "Falha no diagnostico Jira.",
      });
    } finally {
      setConnectionLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    void loadConnectionStatus();
  }, []);

  const handleSave = async () => {
    setMessage(null);
    setSavingSettings(true);
    try {
      let parsedStatusMapping = null;
      if (statusMapping.trim()) {
        parsedStatusMapping = JSON.parse(statusMapping);
      }
      const payload = {
        project_key: projectKey || null,
        board_id: boardId || null,
        jql_base: jqlBase || null,
        status_mapping: parsedStatusMapping,
        aging_days_threshold: Number(agingDays) || 5,
      };
      await apiFetch("/settings/jira", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMessage("Configuracoes salvas com sucesso.");
      await loadConnectionStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar configuracoes.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage(null);
    setSavingPassword(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setPasswordMessage("Senha atualizada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Falha ao atualizar senha.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRunSnapshot = async () => {
    setMessage(null);
    setRunningSnapshot(true);
    try {
      await apiFetch("/dashboard/refresh", { method: "POST" });
      setMessage("Coleta Jira executada. Atualize Visao Geral.");
      await loadConnectionStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao executar coleta Jira.");
    } finally {
      setRunningSnapshot(false);
    }
  };

  const connectionSummary = useMemo(() => {
    if (!connection) return { tone: "muted" as const, label: "Sem diagnostico" };
    if (connection.auth_ok && connection.jql_ok) return { tone: "done" as const, label: "Conectado e validado" };
    if (connection.auth_ok) return { tone: "warning" as const, label: "Auth OK / JQL pendente" };
    return { tone: "blocked" as const, label: "Credenciais ou permissao com erro" };
  }, [connection]);

  return (
    <div className="page-stack">
      <section className="dashboard-section">
        <SectionHead
          title="Configuracoes"
          subtitle="Conexao Jira, JQL e seguranca da conta."
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
                iconLeft="people"
                onClick={() => navigate("/people")}
                className="dashboard-inline-nav-btn"
                title="Ir para Pessoas"
              >
                Pessoas
              </Button>
              <Badge variant={connectionSummary.tone}>{connectionSummary.label}</Badge>
              <Button
                variant="ghost"
                size="sm"
                iconLeft="sync"
                onClick={loadConnectionStatus}
                loading={connectionLoading}
                className="dashboard-inline-nav-btn"
              >
                Testar
              </Button>
              <Button
                size="sm"
                iconLeft="bolt"
                onClick={handleRunSnapshot}
                loading={runningSnapshot}
                className="dashboard-inline-nav-btn"
              >
                Coletar
              </Button>
            </div>
          }
        />
      </section>
      <div className="dashboard-kpi-grid dashboard-kpi-grid--compact">
        <div className="stat-tile">
          <div className="stat-tile__label">Jira (ENV)</div>
          <div className="stat-tile__value">{connection?.env_configured ? "OK" : "Pendente"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__label">Autenticacao</div>
          <div className="stat-tile__value">{connection?.auth_ok ? "OK" : "Falhou"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__label">JQL efetiva</div>
          <div className="stat-tile__value">{connection?.jql_effective ? "Definida" : "Nao definida"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__label">Teste JQL</div>
          <div className="stat-tile__value">
            {connection?.jql_effective ? (connection?.jql_ok ? "OK" : "Falhou") : "Nao testado"}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__label">Issues aprox.</div>
          <div className="stat-tile__value">{connection?.sample_issue_count ?? "-"}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile__label">Status geral</div>
          <div className="stat-tile__value">
            <Badge variant={connectionSummary.tone}>{connectionSummary.label}</Badge>
          </div>
        </div>
      </div>

      {message ? (
        <div className="inline-alert inline-alert--info">
          <div>{message}</div>
          <div className="inline-alert__actions">
            <Button variant="ghost" size="sm" iconLeft="sync" onClick={loadConnectionStatus}>
              Atualizar diagnostico
            </Button>
          </div>
        </div>
      ) : null}

      <Card
        variant="highlight"
        title="Como usar Configuracoes (fluxo recomendado)"
        subtitle="Ordem ideal para configurar o app e evitar erros no dashboard"
        actions={<Badge variant="info">Setup guiado</Badge>}
      >
        <div className="diag-grid">
          <DiagItem label="1. Credenciais (.env)" value="Base URL, e-mail e API token" tone="good" />
          <DiagItem label="2. Escopo" value="Project Key e/ou JQL base" tone="good" />
          <DiagItem label="3. Teste conexao" value="Valide auth e JQL efetiva" tone="warn" />
          <DiagItem label="4. Coleta manual" value="Rode snapshot inicial" tone="warn" />
        </div>

        <div className="checklist">
          <div className="checklist__item">
            Use uma JQL base objetiva (ex.: projeto + tipos/status relevantes) para evitar excesso de ruido.
          </div>
          <div className="checklist__item">
            Ajuste o mapeamento de status para refletir o fluxo real do seu board (done / in_progress / planned).
          </div>
          <div className="checklist__item">
            Depois de salvar: clique em <code>Testar conexao</code> e em seguida <code>Rodar coleta agora</code>.
          </div>
          <div className="checklist__item">
            Se a coleta falhar, verifique primeiro <code>JQL efetiva</code>, <code>Project Key</code> e permissao da conta Jira.
          </div>
        </div>
      </Card>

      <div className="dashboard-grid-2">
        <Card
          title="Escopo monitorado (Jira)"
          subtitle="Defina projeto/JQL base e mapeamentos para dashboard e jobs de snapshot."
          actions={<Badge variant="info">Configuracao do app</Badge>}
        >
          <div className="form-grid form-grid--2">
            <Field label="Project Key (ex.: KAN)">
              <input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} />
            </Field>
            <Field label="ID do Board (opcional)">
              <input value={boardId} onChange={(e) => setBoardId(e.target.value)} />
            </Field>
            <Field label="JQL base (ex.: project = KAN ORDER BY updated DESC)" wide>
              <textarea rows={4} value={jqlBase} onChange={(e) => setJqlBase(e.target.value)} />
            </Field>
            <Field label="Mapeamento de status (JSON)" wide>
              <textarea
                rows={8}
                value={statusMapping}
                onChange={(e) => setStatusMapping(e.target.value)}
                placeholder='{"done":["Concluido"],"in_progress":["Em andamento"]}'
              />
            </Field>
            <Field label="Limite de aging (dias)">
              <input value={agingDays} onChange={(e) => setAgingDays(e.target.value)} />
            </Field>
          </div>

          <div className="toolbar-row toolbar-row--spread">
            <div className="toolbar-row__hint">
              Sem <code>Project Key</code> ou <code>JQL base</code>, a coleta do dashboard pode falhar.
            </div>
            <div className="toolbar-row__actions">
              <Button iconLeft="settings" onClick={handleSave} loading={savingSettings}>
                Salvar configuracoes
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Diagnostico Jira"
          subtitle="As credenciais ficam no backend (.env). Aqui voce apenas valida conectividade, auth e JQL."
          actions={
            <Badge variant={connectionSummary.tone}>
              {connectionLoading ? "Validando..." : connectionSummary.label}
            </Badge>
          }
        >
          <div className="diag-grid">
            <DiagItem
              label="Base URL"
              value={connection?.base_url_configured ? "OK" : "Pendente"}
              tone={connection?.base_url_configured ? "good" : "warn"}
            />
            <DiagItem
              label="Email"
              value={connection?.email_configured ? "OK" : "Pendente"}
              tone={connection?.email_configured ? "good" : "warn"}
            />
            <DiagItem
              label="API Token"
              value={connection?.api_token_configured ? "OK" : "Pendente"}
              tone={connection?.api_token_configured ? "good" : "warn"}
            />
            <DiagItem
              label="Autenticacao Jira"
              value={connection?.auth_ok ? "OK" : "Falhou"}
              tone={connection?.auth_ok ? "good" : "danger"}
            />
          </div>

          <div className="diag-list">
            <DiagRow label="Usuario Jira" value={connection?.jira_user || "-"} />
            <DiagRow label="Project Key efetiva" value={connection?.project_key_effective || "-"} />
            <DiagRow label="JQL efetiva" value={connection?.jql_effective || "-"} code />
            <DiagRow label="Base Jira" value={connection?.jira_base_url || "-"} code />
            <DiagRow
              label="Total aproximado"
              value={
                connection?.sample_issue_count !== undefined && connection?.sample_issue_count !== null
                  ? String(connection.sample_issue_count)
                  : "-"
              }
            />
          </div>

          {connection?.message ? (
            <div className={`inline-alert ${connection.auth_ok ? "inline-alert--info" : "inline-alert--warn"}`}>
              <div>{connection.message}</div>
            </div>
          ) : null}

          {connection?.warnings?.length ? (
            <div className="checklist">
              {connection.warnings.map((warning) => (
                <div key={warning} className="checklist__item">
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <Card
        title="Seguranca da conta"
        subtitle="Troque a senha local do app. Isso nao altera a senha do Jira/Atlassian."
        actions={<Badge variant="warning">Recomendado: 12+ caracteres</Badge>}
      >
        <div className="form-grid form-grid--2">
          <Field label="Senha atual">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label="Nova senha">
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
        </div>

        <div className="toolbar-row toolbar-row--spread">
          <div className="toolbar-row__hint">
            Evite senhas comuns (ex.: <code>admin123</code>). O navegador pode sinalizar vazamento/risco.
          </div>
          <div className="toolbar-row__actions">
            <Button variant="secondary" onClick={handleChangePassword} loading={savingPassword}>
              Atualizar senha
            </Button>
          </div>
        </div>

        {passwordMessage ? (
          <div className="inline-alert inline-alert--info">
            <div>{passwordMessage}</div>
          </div>
        ) : null}
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
    <label className={`field ${wide ? "field--wide" : ""}`.trim()}>
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function DiagItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "danger" | "muted";
}) {
  return (
    <div className="diag-item" data-tone={tone}>
      <div className="diag-item__label">{label}</div>
      <div className="diag-item__value">{value}</div>
    </div>
  );
}

function DiagRow({
  label,
  value,
  code = false,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div className="diag-row">
      <span className="diag-label">{label}</span>
      <span className={`diag-value ${code ? "diag-value--code" : ""}`.trim()}>{value}</span>
    </div>
  );
}

