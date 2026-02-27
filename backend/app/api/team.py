from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.config import get_settings
from app.db.models import JiraSettings, TeamMember
from app.db.session import get_db
from app.schemas.team import (
    JiraPersonOverviewOut,
    JiraPersonTaskOut,
    JiraTeamOverviewOut,
    TeamMemberCreate,
    TeamMemberOut,
    TeamMemberUpdate,
)
from app.services.jira_client import JiraClient, JiraClientError
from app.services.metrics import classify_status

router = APIRouter(prefix="/api/team-members", tags=["team"])


@router.get("", response_model=list[TeamMemberOut])
def list_team_members(
    active: bool | None = None,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = db.query(TeamMember)
    if active is not None:
        query = query.filter(TeamMember.active == active)
    return query.order_by(TeamMember.name.asc()).all()


@router.post("", response_model=TeamMemberOut)
def create_team_member(
    payload: TeamMemberCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin", "manager"])),
):
    member = TeamMember(**payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/{member_id}", response_model=TeamMemberOut)
def get_team_member(
    member_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    member = db.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    return member


@router.patch("/{member_id}", response_model=TeamMemberOut)
def update_team_member(
    member_id: int,
    payload: TeamMemberUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin", "manager"])),
):
    member = db.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{member_id}")
def delete_team_member(
    member_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    member = db.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")
    db.delete(member)
    db.commit()
    return {"ok": True}


@router.get("/jira/overview", response_model=JiraTeamOverviewOut)
def get_jira_team_overview(
    tasks_per_member: int = Query(10, ge=1, le=50),
    max_issues: int = Query(300, ge=50, le=1000),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    app_settings = get_settings()
    jira_settings = db.query(JiraSettings).first()
    mapping = jira_settings.status_mapping if jira_settings else None

    project_key = (
        jira_settings.project_key if jira_settings else None
    ) or app_settings.jira_project_key
    jql_base = jira_settings.jql_base if jira_settings and jira_settings.jql_base else None
    jql = jql_base or (f"project = {project_key} ORDER BY updated DESC" if project_key else None)

    if not jql:
        return JiraTeamOverviewOut(
            available=False,
            message="Defina Project Key ou JQL base em Configuracoes para carregar equipe do Jira.",
        )

    try:
        client = JiraClient()
    except JiraClientError as exc:
        return JiraTeamOverviewOut(available=False, message=str(exc), source_jql=jql)

    fields = [
        "summary",
        "status",
        "assignee",
        "updated",
        "labels",
        "priority",
        "issuetype",
    ]

    issues: list[dict] = []
    next_page_token: str | None = None

    try:
        while True:
            remaining = max_issues - len(issues)
            if remaining <= 0:
                break
            batch_size = 100 if remaining > 100 else remaining
            data = client.search_issues(
                jql=jql,
                fields=fields,
                max_results=batch_size,
                next_page_token=next_page_token,
            )
            batch = data.get("issues", []) or []
            issues.extend(batch)
            next_page_token = data.get("nextPageToken")
            if not next_page_token or not batch:
                break
    except JiraClientError as exc:
        return JiraTeamOverviewOut(available=False, message=str(exc), source_jql=jql)

    groups: dict[str, JiraPersonOverviewOut] = {}

    for issue in issues:
        fields_data = issue.get("fields") or {}
        assignee = fields_data.get("assignee") or {}
        status_obj = fields_data.get("status") or {}
        status_category = (status_obj.get("statusCategory") or {}).get("key")
        status_name = status_obj.get("name")

        account_id = assignee.get("accountId")
        display_name = assignee.get("displayName") or "Nao atribuido"
        email = assignee.get("emailAddress")
        member_key = account_id or "__unassigned__"

        if member_key not in groups:
            groups[member_key] = JiraPersonOverviewOut(
                account_id=account_id,
                display_name=display_name,
                email=email,
            )

        member = groups[member_key]
        member.total_issues += 1
        bucket = classify_status(status_name, status_category, mapping)
        if bucket == "done":
            member.done += 1
        elif bucket == "in_progress":
            member.in_progress += 1
        elif bucket == "planned":
            member.planned += 1
        else:
            member.pending += 1

        member.tasks.append(
            JiraPersonTaskOut(
                key=issue.get("key"),
                summary=fields_data.get("summary"),
                status=status_name,
                priority=(fields_data.get("priority") or {}).get("name"),
                issue_type=(fields_data.get("issuetype") or {}).get("name"),
                labels=fields_data.get("labels") or [],
                updated_at=_safe_datetime(fields_data.get("updated")),
            )
        )

    members = list(groups.values())
    for member in members:
        member.tasks.sort(
            key=lambda t: t.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True
        )
        member.tasks = member.tasks[:tasks_per_member]

    members.sort(key=lambda m: (-m.in_progress, -m.total_issues, (m.display_name or "").lower()))

    return JiraTeamOverviewOut(
        available=True,
        source_jql=jql,
        total_issues=len(issues),
        member_count=len(members),
        fetched_at=datetime.now(timezone.utc),
        members=members,
        message=(
            "Visao agrupada por responsavel a partir das issues do Jira. "
            "Pode nao listar todos os usuarios do tenant se nao houver tarefas atribuidas."
        ),
    )


def _safe_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
