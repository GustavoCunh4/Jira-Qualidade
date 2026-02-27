from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class JiraSettingsBase(BaseModel):
    project_key: str | None = None
    board_id: str | None = None
    jql_base: str | None = None
    status_mapping: dict[str, Any] | None = None
    aging_days_threshold: int | None = None


class JiraSettingsOut(JiraSettingsBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class JiraSettingsUpdate(JiraSettingsBase):
    pass


class JiraConnectionStatusOut(BaseModel):
    env_configured: bool
    base_url_configured: bool
    jira_base_url: str | None = None
    email_configured: bool
    api_token_configured: bool
    auth_ok: bool = False
    jira_user: str | None = None
    jira_account_id: str | None = None
    project_key_effective: str | None = None
    jql_effective: str | None = None
    jql_ok: bool = False
    sample_issue_count: int | None = None
    message: str | None = None
    warnings: list[str] = Field(default_factory=list)
