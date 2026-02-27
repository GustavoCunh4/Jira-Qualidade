from datetime import datetime, timezone
from typing import Iterable

from app.db.models import IssueSnapshot


def _normalize(name: str) -> str:
    return name.strip().lower()


def classify_status(status_name: str | None, status_category: str | None, mapping: dict | None):
    if mapping:
        for key in ("done", "in_progress", "planned", "pending"):
            for status in mapping.get(key, []) or []:
                if status_name and _normalize(status_name) == _normalize(status):
                    return key

    if status_category:
        if status_category.lower() == "done":
            return "done"
        if status_category.lower() == "indeterminate":
            return "in_progress"
        if status_category.lower() == "new":
            if status_name and "plan" in status_name.lower():
                return "planned"
            return "pending"
    return "pending"


def compute_kpis(
    snapshots: Iterable[IssueSnapshot],
    mapping: dict | None,
    aging_days: int,
    now: datetime | None = None,
):
    now = now or datetime.now(timezone.utc)
    counts = {"total": 0, "done": 0, "in_progress": 0, "planned": 0, "pending": 0, "wip": 0}
    aging_items: list[dict] = []
    blockers: list[dict] = []

    for snap in snapshots:
        counts["total"] += 1
        category = classify_status(snap.status, snap.status_category, mapping)
        counts[category] += 1
        if category == "in_progress":
            counts["wip"] += 1
            if snap.updated_at:
                age_days = (now - snap.updated_at).days
                if age_days >= aging_days:
                    aging_items.append(
                        {
                            "issue_key": snap.issue_key,
                            "summary": snap.summary,
                            "assignee": snap.assignee,
                            "days": age_days,
                        }
                    )
        if snap.labels and any(label.lower() in ("blocked", "blocker") for label in snap.labels):
            blockers.append(
                {
                    "issue_key": snap.issue_key,
                    "summary": snap.summary,
                    "assignee": snap.assignee,
                }
            )

    return counts, aging_items, blockers
