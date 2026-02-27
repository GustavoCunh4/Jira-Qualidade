Write-Host "Running migrations..."
docker compose exec backend alembic -c /app/alembic.ini upgrade head
