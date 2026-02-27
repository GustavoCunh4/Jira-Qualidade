from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.config import get_settings as get_app_settings
from app.db.models import JiraSettings
from app.db.session import get_db
from app.schemas.settings import JiraConnectionStatusOut, JiraSettingsOut, JiraSettingsUpdate
from app.services.jira_client import JiraClient, JiraClientError

router = APIRouter(prefix="/api/settings/jira", tags=["settings"])


@router.get("", response_model=JiraSettingsOut)
def get_jira_settings(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    settings = db.query(JiraSettings).first()
    return settings


@router.put("", response_model=JiraSettingsOut)
def update_jira_settings(
    payload: JiraSettingsUpdate,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin", "manager"])),
):
    settings = db.query(JiraSettings).first()
    if not settings:
        settings = JiraSettings()
        db.add(settings)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/connection-test", response_model=JiraConnectionStatusOut)
def test_jira_connection(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    app_settings = get_app_settings()
    db_settings = db.query(JiraSettings).first()

    project_key = (
        db_settings.project_key if db_settings else None
    ) or app_settings.jira_project_key
    jql_base = db_settings.jql_base if db_settings and db_settings.jql_base else None
    jql_effective = jql_base or (
        f"project = {project_key} ORDER BY updated DESC" if project_key else None
    )

    status = JiraConnectionStatusOut(
        env_configured=bool(
            app_settings.jira_base_url and app_settings.jira_email and app_settings.jira_api_token
        ),
        base_url_configured=bool(app_settings.jira_base_url),
        jira_base_url=(
            str(app_settings.jira_base_url).rstrip("/") if app_settings.jira_base_url else None
        ),
        email_configured=bool(app_settings.jira_email),
        api_token_configured=bool(app_settings.jira_api_token),
        project_key_effective=project_key,
        jql_effective=jql_effective,
        warnings=[],
    )

    if not status.env_configured:
        missing = []
        if not status.base_url_configured:
            missing.append("JIRA_BASE_URL")
        if not status.email_configured:
            missing.append("JIRA_EMAIL")
        if not status.api_token_configured:
            missing.append("JIRA_API_TOKEN")
        status.message = "Credenciais Jira ausentes nas variaveis de ambiente: " + ", ".join(
            missing
        )
        return status

    if not jql_effective:
        status.warnings.append(
            "Defina Project Key ou JQL base nas configuracoes para habilitar a tela de Demandas."
        )

    try:
        client = JiraClient()
        me = client.myself()
        status.auth_ok = True
        status.jira_user = me.get("displayName") or me.get("emailAddress")
        status.jira_account_id = me.get("accountId")
        status.message = "Autenticacao Jira OK."
        if jql_effective:
            count = client.approximate_count(jql_effective)
            status.jql_ok = True
            status.sample_issue_count = int(count.get("count", 0))
    except JiraClientError as exc:
        status.auth_ok = False
        status.message = str(exc)
    except Exception:
        status.auth_ok = False
        status.message = "Falha inesperada ao validar conexao com Jira."

    return status
