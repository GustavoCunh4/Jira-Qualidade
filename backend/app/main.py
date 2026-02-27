import logging
import time
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, dashboard, health, issues, jira, settings, team
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.jobs.scheduler import start_scheduler

settings_obj = get_settings()
configure_logging(settings_obj.log_level)
logger = logging.getLogger(__name__)

errors, warnings = settings_obj.validate_runtime()
for warning in warnings:
    logger.warning(warning)
if errors:
    raise RuntimeError(" | ".join(errors))

app = FastAPI(title=settings_obj.app_name)

if settings_obj.trusted_host_list:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings_obj.trusted_host_list,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_obj.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-JQCC-Webhook-Secret"],
)

if settings_obj.rate_limit_enabled:
    requests_per_ip = defaultdict(list)

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        key = _client_ip(request)
        now = time.time()
        window = 60
        requests_per_ip[key] = [ts for ts in requests_per_ip[key] if now - ts < window]
        if len(requests_per_ip[key]) >= settings_obj.rate_limit_per_minute:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
        requests_per_ip[key].append(now)
        return await call_next(request)


if settings_obj.security_headers_enabled:

    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        if settings_obj.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(issues.router)
app.include_router(jira.router)
app.include_router(team.router)
app.include_router(settings.router)


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        init_db(db)
    finally:
        db.close()
    app.state.scheduler = start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        scheduler.shutdown()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    if request.client:
        return request.client.host
    return "anonymous"
