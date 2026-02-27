from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.models import DailyMetrics, IssueSnapshot, JiraSettings
from app.db.session import get_db
from app.jobs.scheduler import run_snapshot_job
from app.schemas.issue import DashboardOut
from app.services.metrics import compute_kpis

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    settings = get_settings()
    jira_settings = db.query(JiraSettings).first()
    mapping = jira_settings.status_mapping if jira_settings else None
    aging_days = (
        jira_settings.aging_days_threshold if jira_settings else None
    ) or settings.aging_days_threshold

    latest_snapshot = db.query(func.max(IssueSnapshot.snapshot_at)).scalar()
    if not latest_snapshot:
        # UX: first access after setup should attempt a snapshot instead of showing an empty dashboard forever.
        run_snapshot_job()
        latest_snapshot = db.query(func.max(IssueSnapshot.snapshot_at)).scalar()
    snapshots = []
    if latest_snapshot:
        snapshots = (
            db.query(IssueSnapshot).filter(IssueSnapshot.snapshot_at == latest_snapshot).all()
        )

    counts, aging_items, blockers = compute_kpis(snapshots, mapping, aging_days)
    percent_done = int((counts["done"] / counts["total"]) * 100) if counts["total"] else 0

    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = to_date - timedelta(days=13)

    metrics = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.day >= from_date, DailyMetrics.day <= to_date)
        .order_by(DailyMetrics.day.asc())
        .all()
    )
    throughput = [
        {
            "day": metric.day.isoformat(),
            "throughput": metric.throughput,
            "done": metric.done,
            "total": metric.total,
        }
        for metric in metrics
    ]

    return DashboardOut(
        kpis={**counts, "percent_done": percent_done},
        throughput=throughput,
        aging=aging_items[:25],
        blockers=blockers[:10],
        meta={
            "latest_snapshot_at": latest_snapshot,
            "snapshot_interval_minutes": settings.snapshot_interval_minutes,
            "data_source": "jira_snapshots",
        },
    )


@router.post("/refresh")
def refresh_dashboard_snapshot(
    _user=Depends(get_current_user),
):
    run_snapshot_job()
    return {"ok": True}
