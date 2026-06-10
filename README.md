# x-executor

NestJS monorepo for automated X (Twitter) DM handling: OAuth connection management, webhook ingestion, LLM replies, campaign bulk DMs, and analytics.

## Services

| App | Role | Default port | Health |
|-----|------|--------------|--------|
| **Hub** | REST API, auth, orgs, OAuth, campaigns, chat history | 3000 | `GET /xbot/v1/api/hub/health` |
| **Webhook** | X Account Activity ingress | 3001 | `GET /xbot/v1/api/webhook/health` |
| **Processor** | DM pipeline (decrypt, LLM, NATS) | 3002 | `GET /xbot/v1/api/processor/health` |
| **Sender** | Outbound DMs via GetXAPI | 3003 | `GET /xbot/v1/api/sender/health` |
| **Scheduler** | Campaign job planning & dispatch | 3004 | `GET /xbot/v1/api/scheduler/health` |
| **Analytics** | Campaign stats consumer | 3005 | `GET /xbot/v1/api/analytics/health` |
| **NATS** | JetStream message bus | 4222 (client), 8222 (monitor) | `GET /healthz` |

Shared libraries live under `libs/` (`nats-js`, `redis`, `getxapi`, `llm`, `shared`).

## Prerequisites

- Node.js 22+
- Yarn 1.x
- MongoDB, Redis, and NATS (local plugins, Docker Compose, or managed cloud)

## Local development

```bash
yarn install
cp .env.example .env   # fill in secrets — see docs/env/
```

Run each app in a separate terminal:

```bash
yarn start:hub:dev
yarn start:webhook:dev
yarn start:processor:dev
yarn start:sender:dev
yarn start:scheduler:dev
yarn start:analytics:dev
```

Build and run a single app in production mode:

```bash
yarn build:hub && yarn start:hub:prod
```

## Deployment

### Docker (recommended for GCP / Kubernetes / any container platform)

Each service has a Dockerfile under `deploy/docker/`. Build **from the repository root**:

| Service | Dockerfile | Exposed port |
|---------|------------|--------------|
| Hub | `deploy/docker/hub/Dockerfile` | 3000 |
| Webhook | `deploy/docker/webhook/Dockerfile` | 3001 |
| Processor | `deploy/docker/processor/Dockerfile` | 3002 |
| Sender | `deploy/docker/sender/Dockerfile` | 3003 |
| Scheduler | `deploy/docker/scheduler/Dockerfile` | 3004 |
| Analytics | `deploy/docker/analytics/Dockerfile` | 3005 |
| NATS | `deploy/docker/nats-js/Dockerfile` | 4222 |

**Build one image** (GCP staging CI pattern):

```bash
docker build \
  -f deploy/docker/hub/Dockerfile \
  --build-arg VALUE_HASH="$(git rev-parse HEAD)" \
  -t x-executor-hub:latest \
  .
```

Replace `hub` with `webhook`, `processor`, `sender`, `scheduler`, or `analytics` for other apps. Each image runs:

```bash
node dist/apps/<app>/main.js
```

**Environment variables** — merge `deploy/env/shared.env.example` with the matching service file from `deploy/env/`:

- `deploy/env/hub.env.example`
- `deploy/env/webhook.env.example`
- `deploy/env/processor.env.example`
- `deploy/env/sender.env.example`
- `deploy/env/scheduler.env.example`
- `deploy/env/analytics.env.example`
- `deploy/env/nats.env.example`

Generate the encryption key once and reuse on Hub, Processor, and Sender:

```bash
openssl rand -base64 32
# → TOKEN_ENCRYPTION_KEY
```

**Secrets that must match across services:**

| Variable | Services |
|----------|----------|
| `MONGODB_URI` | Hub, Webhook, Processor, Sender, Scheduler, Analytics |
| `NATS_URL` | Hub, Webhook, Processor, Sender, Scheduler, Analytics |
| `TOKEN_ENCRYPTION_KEY` | Hub, Processor, Sender |
| `X_API_KEY_SECRET` | Hub (OAuth), Webhook (`X_CONSUMER_SECRET` or same secret) |

Set `PORT` (or `PROCESSOR_PORT` / `SENDER_PORT`) in the container environment. Platforms like Railway inject `PORT` automatically.

**Processor note:** XChat PIN unlock spawns `scripts/xchat-recover-secret.mjs` at runtime; the processor image includes the full repo `scripts/` directory.

### Docker Compose (full local stack)

Runs MongoDB, Redis, NATS, and all six Nest apps:

```bash
cp deploy/docker/.env.example deploy/docker/.env
# Set TOKEN_ENCRYPTION_KEY and X API keys in deploy/docker/.env

docker compose -f deploy/docker/docker-compose.yml up --build
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Hub API |
| http://localhost:3001 | Webhook |
| http://localhost:3002 | Processor |
| http://localhost:3003 | Sender |
| http://localhost:3004 | Scheduler |
| http://localhost:3005 | Analytics |
| nats://localhost:4222 | NATS client |
| http://localhost:8222 | NATS monitor |

Compose wires `MONGODB_URI`, `REDIS_URL`, and `NATS_URL` to the bundled infrastructure containers. Override public URLs in `deploy/docker/.env` if testing OAuth against localhost.

### Railway

Railway uses per-service `railway.toml` files and Yarn build commands instead of Dockerfiles. See **[docs/railway.md](docs/railway.md)** for step-by-step setup (plugins, reference variables, health checks, webhook troubleshooting).

Config paths (repo root):

- `docs/railway/hub/railway.toml`
- `docs/railway/webhook/railway.toml`
- `docs/railway/processor/railway.toml`
- `docs/railway/sender/railway.toml`
- `docs/railway/scheduler/railway.toml`
- `docs/railway/analytics/railway.toml`
- `docs/railway/nats-js/railway.toml`

Legacy env templates also remain in `docs/env/` (same variables as `deploy/env/`).

### Frontend

Campaign UI and admin dashboard live in the separate **x-executor-frontend** repo. Integration guide: **[docs/CREATE_AND_INTEGRATE_FRONTEND.md](docs/CREATE_AND_INTEGRATE_FRONTEND.md)**.

## Tests

```bash
yarn test              # unit tests
yarn test:hub:e2e      # Hub e2e (in-memory Mongo)
yarn test:webhook:e2e  # Webhook e2e
```

## Architecture (high level)

```
X webhook → Webhook → NATS → Processor → NATS → Sender → GetXAPI
                              ↓
                         MongoDB (dm_messages, orgs, connections)

Hub POST campaign → NATS → Scheduler → NATS → Sender
                         ↓
                    Analytics → MongoDB (campaign stats)
```

NATS subjects and consumer durables are defined in `libs/nats-js/src/nats.constants.ts`.
