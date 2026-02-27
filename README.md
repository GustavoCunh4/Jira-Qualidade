# Jira Quality Command Center (JQCC)

Aplicacao web para operacao de qualidade no Jira Cloud.

## Stack
- Backend: FastAPI + SQLAlchemy + Alembic + Gunicorn
- Frontend: React + TypeScript + Vite
- Banco: PostgreSQL
- Auth: JWT em cookie HttpOnly (com suporte a Bearer)

## Estrutura
- `backend/`: API, auth, scheduler, migrations
- `frontend/`: UI React
- `nginx/`: reverse proxy para stack Docker local
- `docker-compose.yml`: sobe stack completa local
- `render.yaml`: blueprint para deploy no Render

## Pre-requisitos
- Docker Desktop (para stack completa local)
- Node 20+ (para frontend local)
- Python 3.11+ (para backend local)

## Configuracao
1. Copie o arquivo de exemplo:

```bash
copy .env.example .env
```

2. Preencha no `.env`:
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JWT_SECRET`
- `ADMIN_BOOTSTRAP_PASSWORD`

## Rodar com Docker (stack completa)
Subir tudo:

```bash
docker compose up -d --build
```

Acessos:
- App: `http://localhost:8080`
- Health backend: `http://localhost:8080/health`

Login inicial:
- Usuario: valor de `ADMIN_BOOTSTRAP_USER`
- Senha: valor de `ADMIN_BOOTSTRAP_PASSWORD`

Parar stack:

```bash
docker compose down
```

Resetar banco local (apaga dados):

```bash
docker compose down -v
```

## Desenvolvimento local (sem Docker)
### Backend
```bash
cd backend
python -m venv .venv
```

Ativar ambiente virtual:

CMD:
```bash
.venv\Scripts\activate.bat
```

PowerShell:
```bash
. .venv\Scripts\activate
```

Instalar dependencias e rodar:
```bash
python -m pip install -e .[dev]
```

Definir banco local SQLite e aplicar migration:

CMD:
```bash
set DATABASE_URL=sqlite:///./jqcc.db
python -m alembic -c alembic.ini upgrade head
```

PowerShell:
```bash
$env:DATABASE_URL="sqlite:///./jqcc.db"
python -m alembic -c alembic.ini upgrade head
```

Subir API:
```bash
uvicorn app.main:app --reload --port 8001
```

Se aparecer erro de porta ocupada (`[Errno 10048]`), o Docker ainda esta usando a `8000`.

Opcao 1 (recomendado): parar o Docker local
```bash
docker compose down
```

Opcao 2: subir backend em outra porta
```bash
uvicorn app.main:app --reload --port 8001
```

### Frontend
Em outro terminal:

```bash
cd frontend
npm ci --include=dev
npm run dev
```

Acesse: `http://localhost:5173`

Observacao: em dev, o Vite usa proxy `/api -> http://localhost:8000`.
Se seu backend estiver na `8001`, rode o frontend assim:

CMD:
```bash
set VITE_API_BASE_URL=http://localhost:8001/api && npm run dev
```

PowerShell:
```bash
$env:VITE_API_BASE_URL="http://localhost:8001/api"
npm run dev
```

## Testes e qualidade
### Backend
```bash
cd backend
python -m ruff check app
python -m pytest
```

### Frontend
```bash
cd frontend
npm run lint
npm run test
npm run build
```

## Onde fica o botao "Sair"
- O botao `Sair` fica visivel no topo do Dashboard (ao lado de `Pessoas` e `Config.`).
- O botao `Sair` tambem fica visivel na barra superior (Topbar).
- Tambem existe no menu de perfil.
- O logout chama `POST /api/auth/logout` e redireciona para `/login`.

Se voce nao enxergar `Sair` no Docker, quase sempre e bundle antigo em cache. Rode:

```bash
docker compose down
docker compose build --no-cache frontend nginx backend
docker compose up -d
```

Depois faca hard refresh no navegador (`Ctrl+F5`).

## Troubleshooting rapido
### 1) "Cannot find type definition file for 'vite/client'"
Instale dependencias do frontend:

```bash
cd frontend
npm ci --include=dev
```

### 2) Login nao funciona
- Confira `ADMIN_BOOTSTRAP_USER` e `ADMIN_BOOTSTRAP_PASSWORD`.
- Se o usuario admin ja existia, mudar `.env` nao troca senha automaticamente.
- Para recriar do zero localmente: `docker compose down -v` e subir de novo.

### 3) Erro Jira (401/403)
- Revalide `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`.
- Teste em `Configuracoes` -> conexao Jira.

## Deploy no Render (Blueprint)
1. Suba o projeto no GitHub.
2. No Render, use **New + Blueprint** apontando para o repo.
3. O Render vai ler `render.yaml` e criar:
   - `jqcc-postgres`
   - `jqcc-backend`
   - `jqcc-frontend`
4. Preencha as variaveis com `sync: false` no painel:
   - `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
   - `ADMIN_BOOTSTRAP_PASSWORD`
   - `CORS_ORIGINS`
   - `TRUSTED_HOSTS`
   - `VITE_API_BASE_URL`

Exemplo:
- `CORS_ORIGINS=https://seu-frontend.onrender.com`
- `TRUSTED_HOSTS=seu-backend.onrender.com`
- `VITE_API_BASE_URL=https://seu-backend.onrender.com/api`

### Modo 100% gratuito no Render
O `render.yaml` deste projeto ja esta configurado para usar plano `free` no backend e no Postgres.

Limitacoes importantes do free tier:
- O backend pode entrar em sleep por inatividade (primeira resposta apos idle pode demorar).
- O Postgres free pode expirar se ficar muito tempo sem uso.
- O scheduler em processo (`SCHEDULER_ENABLED=true`) nao e ideal para free tier, porque depende do backend estar ativo.

Se quiser reduzir risco no free tier:
- Defina `SCHEDULER_ENABLED=false` no backend.
- Mantenha uma rotina de acesso ao app para evitar inatividade longa.

## Comandos uteis (PowerShell e CMD)
PowerShell:
- `scripts\up.ps1`
- `scripts\down.ps1`
- `scripts\migrate.ps1`
- `scripts\seed.ps1`

CMD (chamando scripts PowerShell):
- `powershell -ExecutionPolicy Bypass -File scripts\up.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts\down.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts\migrate.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts\seed.ps1`
