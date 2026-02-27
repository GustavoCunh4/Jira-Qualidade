export type User = {
  id: number;
  username: string;
  role: string;
};

export type Issue = {
  key: string;
  summary?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  issue_type?: string;
  labels: string[];
  created_at?: string;
  updated_at?: string;
};

export type TeamMember = {
  id: number;
  name: string;
  email?: string;
  area?: string;
  active: boolean;
  preferences?: Record<string, unknown>;
};

export type DashboardResponse = {
  kpis: Record<string, number>;
  throughput: { day: string; throughput: number; done: number; total: number }[];
  aging: { issue_key: string; summary?: string; assignee?: string; days: number }[];
  blockers: { issue_key: string; summary?: string; assignee?: string }[];
  meta?: {
    latest_snapshot_at?: string | null;
    snapshot_interval_minutes?: number;
    data_source?: string;
  };
};

export type JiraConnectionStatus = {
  env_configured: boolean;
  base_url_configured: boolean;
  jira_base_url?: string | null;
  email_configured: boolean;
  api_token_configured: boolean;
  auth_ok: boolean;
  jira_user?: string | null;
  jira_account_id?: string | null;
  project_key_effective?: string | null;
  jql_effective?: string | null;
  jql_ok: boolean;
  sample_issue_count?: number | null;
  message?: string | null;
  warnings: string[];
};

export type JiraPersonTask = {
  key: string;
  summary?: string | null;
  status?: string | null;
  priority?: string | null;
  issue_type?: string | null;
  labels: string[];
  updated_at?: string | null;
};

export type JiraPersonOverview = {
  account_id?: string | null;
  display_name: string;
  email?: string | null;
  total_issues: number;
  done: number;
  in_progress: number;
  planned: number;
  pending: number;
  tasks: JiraPersonTask[];
};

export type JiraTeamOverview = {
  available: boolean;
  message?: string | null;
  source_jql?: string | null;
  total_issues: number;
  member_count: number;
  fetched_at?: string | null;
  members: JiraPersonOverview[];
};
