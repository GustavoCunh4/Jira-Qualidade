import logging
from datetime import datetime
from time import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.config import get_settings
from app.db.models import JiraSettings
from app.db.session import get_db
from app.schemas.issue import (
    AssigneeRequest,
    CommentCreate,
    IssueCreate,
    IssueListOut,
    IssueOut,
    TransitionOut,
    TransitionRequest,
)
from app.services.jira_client import JiraClient, JiraClientError

router = APIRouter(prefix="/api/issues", tags=["issues"])
logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 300
_token_cache: dict[tuple[str, int], dict[str, Any]] = {}


def _parse_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _quote(value: str) -> str:
    escaped = value.replace('"', '\\"')
    return f'"{escaped}"'


def _build_jql(base: str | None, filters: dict[str, Any]) -> str:
    parts: list[str] = []
    order_by = ""
    if base:
        base_lower = base.lower()
        if "order by" in base_lower:
            idx = base_lower.rfind("order by")
            base_condition = base[:idx].strip()
            order_by = base[idx:].strip()
        else:
            base_condition = base.strip()
        if base_condition:
            parts.append(f"({base_condition})")

    if filters.get("assignee"):
        assignee_value = filters["assignee"]
        if assignee_value == "unassigned":
            parts.append("assignee is EMPTY")
        elif assignee_value.lower().startswith("accountid:") or assignee_value.lower().startswith(
            "id:"
        ):
            account_id = assignee_value.split(":", 1)[1].strip()
            if account_id:
                parts.append(f"assignee = accountId({_quote(account_id)})")
        else:
            parts.append(f"assignee = {_quote(assignee_value)}")

    if filters.get("status"):
        values = ", ".join(_quote(v) for v in filters["status"])
        parts.append(f"status in ({values})")

    if filters.get("labels"):
        values = ", ".join(_quote(v) for v in filters["labels"])
        parts.append(f"labels in ({values})")

    if filters.get("issue_type"):
        values = ", ".join(_quote(v) for v in filters["issue_type"])
        parts.append(f"issuetype in ({values})")

    if filters.get("priority"):
        values = ", ".join(_quote(v) for v in filters["priority"])
        parts.append(f"priority in ({values})")

    if filters.get("from_date"):
        parts.append(f"updated >= {_quote(filters['from_date'])}")

    if filters.get("to_date"):
        parts.append(f"updated <= {_quote(filters['to_date'])}")

    if filters.get("text"):
        parts.append(f"text ~ {_quote(filters['text'])}")

    jql = " AND ".join(parts) if parts else ""
    if jql and order_by:
        jql = f"{jql} {order_by}"
    elif jql:
        jql = f"{jql} ORDER BY updated DESC"
    return jql


def _get_page_token(
    client: JiraClient,
    jql: str,
    fields: list[str],
    max_results: int,
    page_index: int,
) -> str | None:
    if page_index <= 0:
        return None

    key = (jql, max_results)
    now = time()
    entry = _token_cache.get(key)
    if not entry or now - entry.get("ts", 0) > TOKEN_TTL_SECONDS:
        entry = {"ts": now, "tokens": {0: None}}
        _token_cache[key] = entry

    tokens: dict[int, str | None] = entry["tokens"]
    if page_index in tokens:
        return tokens[page_index]

    current = max(tokens.keys())
    token = tokens.get(current)
    while current < page_index:
        data = client.search_issues(
            jql=jql, fields=fields, max_results=max_results, next_page_token=token
        )
        token = data.get("nextPageToken")
        current += 1
        tokens[current] = token
        if not token:
            break

    entry["ts"] = now
    return tokens.get(page_index)


def _get_jira_settings(db: Session) -> JiraSettings | None:
    return db.query(JiraSettings).first()


@router.get("", response_model=IssueListOut)
def list_issues(
    assignee: str | None = None,
    status: str | None = None,
    labels: str | None = None,
    issue_type: str | None = None,
    priority: str | None = None,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    text: str | None = None,
    start_at: int = 0,
    max_results: int = 50,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    settings = get_settings()
    jira_settings = _get_jira_settings(db)
    jql_base = jira_settings.jql_base if jira_settings else None
    project_key = (
        jira_settings.project_key if jira_settings else None
    ) or settings.jira_project_key
    if not jql_base and project_key:
        jql_base = f"project = {project_key}"
    filters = {
        "assignee": assignee,
        "status": _parse_list(status),
        "labels": _parse_list(labels),
        "issue_type": _parse_list(issue_type),
        "priority": _parse_list(priority),
        "from_date": from_date,
        "to_date": to_date,
        "text": text,
    }
    jql = _build_jql(jql_base, filters)
    if not jql:
        raise HTTPException(
            status_code=400,
            detail="Jira não configurado. Defina Project Key ou JQL base em Configurações.",
        )

    fields = [
        "summary",
        "status",
        "assignee",
        "created",
        "updated",
        "labels",
        "priority",
        "issuetype",
    ]
    try:
        client = JiraClient()
        page_index = start_at // max_results if max_results else 0
        page_token = _get_page_token(client, jql, fields, max_results, page_index)
        data = client.search_issues(
            jql=jql, fields=fields, max_results=max_results, next_page_token=page_token
        )
        if data.get("nextPageToken"):
            cache_key = (jql, max_results)
            entry = _token_cache.get(cache_key) or {"ts": time(), "tokens": {0: None}}
            entry["tokens"][page_index + 1] = data.get("nextPageToken")
            entry["ts"] = time()
            _token_cache[cache_key] = entry
        total_count = 0
        try:
            count_data = client.approximate_count(jql=jql)
            total_count = count_data.get("count", 0)
        except JiraClientError as exc:
            logger.warning("approximate-count indisponivel: %s", exc)
            total_count = start_at + len(data.get("issues", []))
            if data.get("nextPageToken"):
                total_count += max_results
    except JiraClientError as exc:
        message = str(exc)
        if exc.status_code == 410 and "search/jql" in message:
            message = (
                "Integracao Jira incompatível na imagem em execução. Refaça o build do backend "
                "e reinicie os containers. Detalhe Jira: "
                f"{message}"
            )
        raise HTTPException(status_code=exc.status_code, detail=message)

    issues = []
    for issue in data.get("issues", []):
        fields_data = issue.get("fields", {})
        issues.append(
            IssueOut(
                key=issue.get("key"),
                summary=fields_data.get("summary"),
                status=(fields_data.get("status") or {}).get("name"),
                assignee=(fields_data.get("assignee") or {}).get("displayName"),
                priority=(fields_data.get("priority") or {}).get("name"),
                issue_type=(fields_data.get("issuetype") or {}).get("name"),
                labels=fields_data.get("labels") or [],
                created_at=_safe_datetime(fields_data.get("created")),
                updated_at=_safe_datetime(fields_data.get("updated")),
            )
        )

    return IssueListOut(
        issues=issues,
        total=total_count,
        start_at=start_at,
        max_results=max_results,
    )


@router.post("", response_model=dict)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin", "manager"])),
):
    settings = get_settings()
    jira_settings = _get_jira_settings(db)
    project_key = (
        jira_settings.project_key if jira_settings else None
    ) or settings.jira_project_key
    if not project_key:
        raise HTTPException(status_code=400, detail="Project key not configured")

    fields: dict[str, Any] = {
        "project": {"key": project_key},
        "summary": payload.summary,
    }
    if payload.description:
        fields["description"] = _to_adf(payload.description)
    if payload.labels:
        fields["labels"] = payload.labels
    if payload.assignee_id:
        fields["assignee"] = {"accountId": payload.assignee_id}
    if payload.issue_type:
        fields["issuetype"] = {"name": payload.issue_type}
    if payload.priority:
        fields["priority"] = {"name": payload.priority}

    try:
        client = JiraClient()
        data = client.create_issue({"fields": fields})
    except JiraClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    return data


@router.post("/{issue_key}/comment")
def add_comment(
    issue_key: str,
    payload: CommentCreate,
    _user=Depends(require_role(["admin", "manager"])),
):
    try:
        client = JiraClient()
        return client.add_comment(issue_key, _to_adf(payload.body))
    except JiraClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/{issue_key}/transitions", response_model=list[TransitionOut])
def get_transitions(
    issue_key: str,
    _user=Depends(get_current_user),
):
    try:
        client = JiraClient()
        data = client.get_transitions(issue_key)
    except JiraClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    transitions = [TransitionOut(id=t["id"], name=t["name"]) for t in data.get("transitions", [])]
    return transitions


@router.post("/{issue_key}/transition")
def transition_issue(
    issue_key: str,
    payload: TransitionRequest,
    _user=Depends(require_role(["admin", "manager"])),
):
    try:
        client = JiraClient()
        return client.transition_issue(issue_key, payload.transition_id)
    except JiraClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.patch("/{issue_key}/assignee")
def assign_issue(
    issue_key: str,
    payload: AssigneeRequest,
    _user=Depends(require_role(["admin", "manager"])),
):
    try:
        client = JiraClient()
        return client.assign_issue(issue_key, payload.account_id)
    except JiraClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


def _safe_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _to_adf(text: str) -> dict[str, Any]:
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": text},
                ],
            }
        ],
    }
