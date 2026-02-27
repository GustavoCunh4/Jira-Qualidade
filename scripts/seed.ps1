Write-Host "Seeding initial data..."
docker compose exec backend python -m app.seed
