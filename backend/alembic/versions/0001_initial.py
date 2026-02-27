"""initial

Revision ID: 0001
Revises: 
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False, unique=True),
        sa.Column("email", sa.String(length=255), nullable=True, unique=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "team_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("area", sa.String(length=120), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("preferences", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "jira_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_key", sa.String(length=50), nullable=True),
        sa.Column("board_id", sa.String(length=50), nullable=True),
        sa.Column("jql_base", sa.Text(), nullable=True),
        sa.Column("status_mapping", sa.JSON(), nullable=True),
        sa.Column("aging_days_threshold", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "issue_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_key", sa.String(length=20), nullable=False, index=True),
        sa.Column("summary", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=120), nullable=False),
        sa.Column("status_category", sa.String(length=50), nullable=True),
        sa.Column("assignee", sa.String(length=255), nullable=True),
        sa.Column("priority", sa.String(length=50), nullable=True),
        sa.Column("issue_type", sa.String(length=50), nullable=True),
        sa.Column("labels", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "daily_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False, unique=True),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("in_progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("planned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pending", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("wip", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("throughput", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("percent_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("aging_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("daily_metrics")
    op.drop_table("issue_snapshots")
    op.drop_table("jira_settings")
    op.drop_table("team_members")
    op.drop_table("users")
