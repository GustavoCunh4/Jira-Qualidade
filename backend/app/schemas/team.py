from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TeamMemberBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    area: str | None = Field(default=None, max_length=120)
    active: bool = True
    preferences: dict[str, Any] | None = None


class TeamMemberCreate(TeamMemberBase):
    pass


class TeamMemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    area: str | None = Field(default=None, max_length=120)
    active: bool | None = None
    preferences: dict[str, Any] | None = None


class TeamMemberOut(TeamMemberBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class JiraPersonTaskOut(BaseModel):
    key: str
    summary: str | None = None
    status: str | None = None
    priority: str | None = None
    issue_type: str | None = None
    labels: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class JiraPersonOverviewOut(BaseModel):
    account_id: str | None = None
    display_name: str
    email: str | None = None
    total_issues: int = 0
    done: int = 0
    in_progress: int = 0
    planned: int = 0
    pending: int = 0
    tasks: list[JiraPersonTaskOut] = Field(default_factory=list)


class JiraTeamOverviewOut(BaseModel):
    available: bool
    message: str | None = None
    source_jql: str | None = None
    total_issues: int = 0
    member_count: int = 0
    fetched_at: datetime | None = None
    members: list[JiraPersonOverviewOut] = Field(default_factory=list)
