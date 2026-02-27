import logging

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    MIN_PASSWORD_LENGTH,
    get_password_hash,
    validate_password_strength,
    verify_password,
)
from app.db.models import JiraSettings, User

logger = logging.getLogger(__name__)


def init_db(db: Session) -> None:
    settings = get_settings()
    if len(settings.admin_bootstrap_password or "") < MIN_PASSWORD_LENGTH:
        logger.warning(
            "ADMIN_BOOTSTRAP_PASSWORD fraca/curta. Use uma senha forte e troque apos o primeiro login."
        )

    existing = db.query(User).filter(User.username == settings.admin_bootstrap_user).first()
    if not existing:
        try:
            validate_password_strength(settings.admin_bootstrap_password)
        except ValueError as exc:
            raise RuntimeError(
                "ADMIN_BOOTSTRAP_PASSWORD insegura para criar o usuario admin inicial."
            ) from exc
        admin = User(
            username=settings.admin_bootstrap_user,
            email=None,
            hashed_password=get_password_hash(settings.admin_bootstrap_password),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        logger.info("Bootstrap admin user created: %s", settings.admin_bootstrap_user)
    else:
        if not verify_password(settings.admin_bootstrap_password, existing.hashed_password):
            logger.info(
                "Bootstrap admin '%s' already exists; ADMIN_BOOTSTRAP_PASSWORD from .env is ignored for existing users.",
                settings.admin_bootstrap_user,
            )

    jira_settings = db.query(JiraSettings).first()
    if not jira_settings:
        jira_settings = JiraSettings(
            project_key=settings.jira_project_key,
            jql_base=None,
            board_id=None,
            status_mapping=None,
            aging_days_threshold=settings.aging_days_threshold,
        )
        db.add(jira_settings)
    else:
        if not jira_settings.project_key and settings.jira_project_key:
            jira_settings.project_key = settings.jira_project_key
        if not jira_settings.aging_days_threshold and settings.aging_days_threshold:
            jira_settings.aging_days_threshold = settings.aging_days_threshold

    db.commit()
