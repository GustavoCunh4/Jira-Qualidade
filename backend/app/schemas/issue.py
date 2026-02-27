from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IssueOut(BaseModel):
    key: str
    summary: str | None
    status: str | None
    assignee: str | None
    priority: str | None
    issue_type: str | None
    labels: list[str]
    created_at: datetime | None
    updated_at: datetime | None


class IssueListOut(BaseModel):
    issues: list[IssueOut]
    total: int
    start_at: int
    max_results: int


class IssueCreate(BaseModel):
    summary: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=10000)
    labels: list[str] | None = None
    assignee_id: str | None = Field(default=None, max_length=255)
    issue_type: str | None = Field(default=None, max_length=120)
    priority: str | None = Field(default=None, max_length=120)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class TransitionRequest(BaseModel):
    transition_id: str = Field(min_length=1, max_length=50)


class AssigneeRequest(BaseModel):
    account_id: str = Field(min_length=1, max_length=255)


class JiraUser(BaseModel):
    account_id: str
    display_name: str
    email: str | None = None


class JiraUserSearchResponse(BaseModel):
    available: bool
    message: str | None = None
    users: list[JiraUser] = Field(default_factory=list)


class TransitionOut(BaseModel):
    id: str
    name: str


class DashboardOut(BaseModel):
    kpis: dict[str, Any]
    throughput: list[dict[str, Any]]
    aging: list[dict[str, Any]]
    blockers: list[dict[str, Any]]
    meta: dict[str, Any] | None = None
