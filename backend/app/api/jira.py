from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.jobs.scheduler import run_snapshot_job
from app.schemas.issue import JiraUserSearchResponse
from app.services.jira_client import JiraClient, JiraClientError

router = APIRouter(prefix="/api/jira", tags=["jira"])


@router.get("/users/search", response_model=JiraUserSearchResponse)
def jira_user_search(
    query: str,
    _user=Depends(get_current_user),
):
    try:
        client = JiraClient()
        data = client.user_search(query)
    except JiraClientError as exc:
        if exc.status_code in (401, 403):
            return JiraUserSearchResponse(available=False, message="Ação indisponível")
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    users = []
    for user in data:
        users.append(
            {
                "account_id": user.get("accountId"),
                "display_name": user.get("displayName"),
                "email": user.get("emailAddress"),
            }
        )
    return JiraUserSearchResponse(available=True, users=users)


@router.post("/sync-now")
def jira_sync_now(
    _user=Depends(get_current_user),
):
    run_snapshot_job()
    return {"ok": True, "message": "Sincronizacao Jira executada."}


@router.post("/webhook")
async def jira_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_jqcc_webhook_secret: str | None = Header(default=None, alias="X-JQCC-Webhook-Secret"),
):
    settings = get_settings()
    if not settings.jira_webhook_enabled:
        raise HTTPException(status_code=404, detail="Webhook Jira desabilitado.")

    if settings.jira_webhook_secret and x_jqcc_webhook_secret != settings.jira_webhook_secret:
        raise HTTPException(status_code=401, detail="Webhook secret invalido.")

    payload = await request.json()
    # Webhook is fire-and-forget: trigger a snapshot refresh to reflect Jira updates in monitoring screens.
    background_tasks.add_task(run_snapshot_job)
    return {
        "ok": True,
        "received": True,
        "event": payload.get("webhookEvent") if isinstance(payload, dict) else None,
    }
