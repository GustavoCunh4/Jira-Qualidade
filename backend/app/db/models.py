from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Integer, String, Text

from app.db.base import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), nullable=True)
    area = Column(String(120), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    preferences = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class JiraSettings(Base):
    __tablename__ = "jira_settings"

    id = Column(Integer, primary_key=True)
    project_key = Column(String(50), nullable=True)
    board_id = Column(String(50), nullable=True)
    jql_base = Column(Text, nullable=True)
    status_mapping = Column(JSON, nullable=True)
    aging_days_threshold = Column(Integer, default=5, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class IssueSnapshot(Base):
    __tablename__ = "issue_snapshots"

    id = Column(Integer, primary_key=True)
    issue_key = Column(String(20), nullable=False, index=True)
    summary = Column(String(255), nullable=True)
    status = Column(String(120), nullable=False)
    status_category = Column(String(50), nullable=True)
    assignee = Column(String(255), nullable=True)
    priority = Column(String(50), nullable=True)
    issue_type = Column(String(50), nullable=True)
    labels = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
    snapshot_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DailyMetrics(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True)
    day = Column(Date, nullable=False, unique=True)
    total = Column(Integer, default=0, nullable=False)
    done = Column(Integer, default=0, nullable=False)
    in_progress = Column(Integer, default=0, nullable=False)
    planned = Column(Integer, default=0, nullable=False)
    pending = Column(Integer, default=0, nullable=False)
    wip = Column(Integer, default=0, nullable=False)
    throughput = Column(Integer, default=0, nullable=False)
    percent_done = Column(Integer, default=0, nullable=False)
    aging_count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
