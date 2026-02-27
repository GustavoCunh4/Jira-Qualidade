from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

STRONG_SECRET_MIN_LENGTH = 32
DEFAULT_LOCAL_ORIGINS = "http://localhost:5173,http://localhost:8080"


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_ignore_empty=True,
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Jira Quality Command Center"
    app_env: str = Field(default="dev", validation_alias="APP_ENV")

    database_url: str = Field(default="sqlite:///./jqcc.db", validation_alias="DATABASE_URL")

    jira_base_url: AnyUrl | None = Field(default=None, validation_alias="JIRA_BASE_URL")
    jira_email: str | None = Field(default=None, validation_alias="JIRA_EMAIL")
    jira_api_token: str | None = Field(default=None, validation_alias="JIRA_API_TOKEN")
    jira_project_key: str | None = Field(default=None, validation_alias="JIRA_PROJECT_KEY")
    jira_webhook_enabled: bool = Field(default=False, validation_alias="JIRA_WEBHOOK_ENABLED")
    jira_webhook_secret: str | None = Field(default=None, validation_alias="JIRA_WEBHOOK_SECRET")

    jwt_secret: str = Field(default="CHANGE_ME", validation_alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = Field(default=120, validation_alias="JWT_EXPIRES_MINUTES")

    auth_cookie_name: str = Field(default="jqcc_access_token", validation_alias="AUTH_COOKIE_NAME")
    auth_cookie_secure: bool = Field(default=False, validation_alias="AUTH_COOKIE_SECURE")
    auth_cookie_samesite: str = Field(default="lax", validation_alias="AUTH_COOKIE_SAMESITE")

    admin_bootstrap_user: str = Field(default="admin", validation_alias="ADMIN_BOOTSTRAP_USER")
    admin_bootstrap_password: str = Field(
        default="Admin#2026!", validation_alias="ADMIN_BOOTSTRAP_PASSWORD"
    )

    cors_origins: str = Field(
        default=DEFAULT_LOCAL_ORIGINS,
        validation_alias="CORS_ORIGINS",
    )
    trusted_hosts: str = Field(default="", validation_alias="TRUSTED_HOSTS")
    security_headers_enabled: bool = Field(
        default=True, validation_alias="SECURITY_HEADERS_ENABLED"
    )

    scheduler_enabled: bool = Field(default=True, validation_alias="SCHEDULER_ENABLED")
    snapshot_interval_minutes: int = Field(default=10, validation_alias="SNAPSHOT_INTERVAL_MINUTES")
    aging_days_threshold: int = Field(default=5, validation_alias="AGING_DAYS_THRESHOLD")

    rate_limit_enabled: bool = Field(default=False, validation_alias="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=120, validation_alias="RATE_LIMIT_PER_MINUTE")

    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "prod"

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

    @property
    def cors_origin_list(self) -> List[str]:
        return _split_csv(self.cors_origins)

    @property
    def trusted_host_list(self) -> List[str]:
        hosts = _split_csv(self.trusted_hosts)
        if hosts:
            return hosts
        return ["*"] if not self.is_production else []

    @property
    def cookie_samesite(self) -> str:
        value = self.auth_cookie_samesite.lower()
        if value not in {"lax", "strict", "none"}:
            return "lax"
        return value

    @property
    def cookie_secure(self) -> bool:
        return self.auth_cookie_secure or self.is_production

    def validate_runtime(self) -> tuple[list[str], list[str]]:
        errors: list[str] = []
        warnings: list[str] = []

        if not self.cors_origin_list:
            warnings.append("CORS_ORIGINS vazio. Isso pode bloquear chamadas do frontend.")

        if self.is_production:
            if self.sqlalchemy_database_url.startswith("sqlite"):
                errors.append("DATABASE_URL com SQLite em producao. Use PostgreSQL gerenciado.")

            if len((self.jwt_secret or "").strip()) < STRONG_SECRET_MIN_LENGTH:
                errors.append(
                    f"JWT_SECRET fraco. Use no minimo {STRONG_SECRET_MIN_LENGTH} caracteres."
                )

            if self.jwt_secret in {"CHANGE_ME", "troque-por-um-segredo-forte", "1h"}:
                errors.append("JWT_SECRET padrao detectado. Configure um segredo unico.")

            if not self.cookie_secure:
                errors.append("AUTH_COOKIE_SECURE deve estar habilitado em producao.")

            if not self.rate_limit_enabled:
                warnings.append("RATE_LIMIT_ENABLED esta desativado em producao.")

        return errors, warnings


@lru_cache
def get_settings() -> Settings:
    return Settings()
