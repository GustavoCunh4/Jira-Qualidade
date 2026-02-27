#!/bin/sh
set -e

alembic -c /app/alembic.ini upgrade head

PORT_TO_BIND="${PORT:-8000}"
exec gunicorn -k uvicorn.workers.UvicornWorker -w "${WEB_CONCURRENCY:-2}" -b "0.0.0.0:${PORT_TO_BIND}" app.main:app
