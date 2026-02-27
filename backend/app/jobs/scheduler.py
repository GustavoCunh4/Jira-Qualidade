from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import DailyMetrics, IssueSnapshot, JiraSettings
from app.db.session import SessionLocal
from app.services.jira_client import JiraClient, JiraClientError
from app.services.metrics import compute_kpis

logger = logging.getLogger(__name__)
_scheduler_lock_fd: int | None = None


def _snapshot_once(db: Session) -> None:
    settings = get_settings()
    jira_settings = db.query(JiraSettings).first()
    project_key = (
        jira_settings.project_key if jira_settings else None
    ) or settings.jira_project_key
    if not project_key:
        logger.warning("Jira project key not configured; skipping snapshot")
        return

    jql = jira_settings.jql_base if jira_settings and jira_settings.jql_base else None
    if not jql:
        jql = f"project = {project_key} ORDER BY updated DESC"

    try:
        client = JiraClient()
    except JiraClientError as exc:
        logger.warning("Jira client unavailable: %s", exc)
        return

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

    max_results = 100
    next_page_token: str | None = None
    now = datetime.now(timezone.utc)
    snapshots: list[IssueSnapshot] = []

    while True:
        data = client.search_issues(
            jql=jql, fields=fields, max_results=max_results, next_page_token=next_page_token
        )
        issues = data.get("issues", [])
        for issue in issues:
            fields_data = issue.get("fields", {})
            status = fields_data.get("status") or {}
            status_category = status.get("statusCategory", {})
            assignee = fields_data.get("assignee") or {}
            snapshots.append(
                IssueSnapshot(
                    issue_key=issue.get("key"),
                    summary=fields_data.get("summary"),
                    status=status.get("name"),
                    status_category=status_category.get("key"),
                    assignee=assignee.get("displayName"),
                    priority=(fields_data.get("priority") or {}).get("name"),
                    issue_type=(fields_data.get("issuetype") or {}).get("name"),
                    labels=fields_data.get("labels") or [],
                    created_at=_safe_datetime(fields_data.get("created")),
                    updated_at=_safe_datetime(fields_data.get("updated")),
                    snapshot_at=now,
                )
            )
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break

    if not snapshots:
        logger.info("No Jira issues returned for snapshot")
        return

    db.add_all(snapshots)
    db.commit()

    mapping = jira_settings.status_mapping if jira_settings else None
    aging_days = (
        jira_settings.aging_days_threshold if jira_settings else None
    ) or settings.aging_days_threshold
    counts, aging_items, _blockers = compute_kpis(snapshots, mapping, aging_days, now)

    throughput = 0
    for snap in snapshots:
        if (
            snap.status_category == "done"
            and snap.updated_at
            and snap.updated_at.date() == now.date()
        ):
            throughput += 1

    percent_done = int((counts["done"] / counts["total"]) * 100) if counts["total"] else 0

    metric = db.query(DailyMetrics).filter(DailyMetrics.day == date.today()).first()
    if not metric:
        metric = DailyMetrics(day=date.today())
        db.add(metric)

    metric.total = counts["total"]
    metric.done = counts["done"]
    metric.in_progress = counts["in_progress"]
    metric.planned = counts["planned"]
    metric.pending = counts["pending"]
    metric.wip = counts["wip"]
    metric.throughput = throughput
    metric.percent_done = percent_done
    metric.aging_count = len(aging_items)

    db.commit()


def _safe_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def run_snapshot_job():
    db = SessionLocal()
    try:
        _snapshot_once(db)
    except Exception:
        logger.exception("Snapshot job failed")
    finally:
        db.close()


def start_scheduler():
    settings = get_settings()
    if not settings.scheduler_enabled:
        return None

    if not _acquire_scheduler_lock():
        logger.info("Scheduler skipped in this worker (lock already held)")
        return None

    scheduler = BackgroundScheduler()
    scheduler.add_job(run_snapshot_job, "interval", minutes=settings.snapshot_interval_minutes)
    scheduler.start()
    return scheduler


def _acquire_scheduler_lock() -> bool:
    global _scheduler_lock_fd
    if _scheduler_lock_fd is not None:
        return True
    if os.name != "posix":
        # Local Windows dev usually runs a single process; keep behavior simple there.
        return True
    try:
        import fcntl  # type: ignore

        lock_path = "/tmp/jqcc_scheduler.lock"
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o644)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _scheduler_lock_fd = fd
        return True
    except Exception:
        if "fd" in locals():
            try:
                os.close(fd)
            except OSError:
                pass
        return False
