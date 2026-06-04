# Railway deployment

This monorepo runs three NestJS apps plus a NATS server from one repository. Railway does **not** support multiple services in a single `railway.toml`; create **one Railway service per row** and point each at its config file under `docs/railway/`.

| Service   | Config file                            | Deploy |
|-----------|----------------------------------------|--------|
| Hub       | `/docs/railway/hub/railway.toml`       | `yarn start:hub:prod` |
| Webhook   | `/docs/railway/webhook/railway.toml`   | `yarn start:webhook:prod` |
| Processor | `/docs/railway/processor/railway.toml` | `yarn start:processor:prod` |
| NATS      | `/docs/railway/nats-js/railway.toml`   | Docker (`nats:2.10-alpine` + JetStream) |

Environment templates live in `docs/env/`:

- `shared.env.example` — MongoDB, Redis, NATS URL placeholders
- `nats.env.example` — NATS server (`NATS_URL` only; routing is in `libs/nats-js/src/nats.constants.ts`)
- `hub.env.example` — OAuth, JWT, public URLs
- `webhook.env.example` — webhook base URL, X secret
- `processor.env.example` — GetXAPI, OpenAI, encryption key

For local development, the root `.env.example` still lists all variables in one file.

## Setup

1. **Create a Railway project** and connect this GitHub repo (root directory `/` for all services).

2. **Add data stores** (Railway plugins or external):
   - MongoDB → `MONGODB_URI`
   - Redis → `REDIS_URL` (hub + processor)
   - NATS → deploy with `docs/railway/nats-js/railway.toml` (see below)

3. **Create four services** (NATS, Hub, Webhook, Processor). For each:
   - **Settings → Config file**: set the absolute path from the table above (paths are from repo root, not a root-directory override).
   - **Settings → Networking**: generate a public domain for **Hub** and **Webhook** only. Keep **NATS**, **Processor**, and optionally MongoDB/Redis private.
   - **NATS only**: add a [volume](https://docs.railway.com/guides/volumes) mounted at `/data` so JetStream file storage survives redeploys. Set `PORT=8222` for healthchecks (from `docs/env/nats.env.example`).
   - **Variables**: copy from `docs/env/shared.env.example` plus the matching service file. Use Railway [reference variables](https://docs.railway.com/develop/variables#reference-variables) for cross-service URLs, for example:
     ```bash
     NATS_URL=nats://${{Nats.RAILWAY_PRIVATE_DOMAIN}}:4222
     HUB_PUBLIC_BASE_URL=https://${{Hub.RAILWAY_PUBLIC_DOMAIN}}
     WEBHOOK_PUBLIC_BASE_URL=https://${{Webhook.RAILWAY_PUBLIC_DOMAIN}}
     X_REDIRECT_URI=https://${{Hub.RAILWAY_PUBLIC_DOMAIN}}/api/v1/oauth/x/callback
     ```
     Rename `Nats` in references to match your Railway service name.

4. **Shared secrets** must match across services:
   - `X_CLIENT_SECRET` — hub and webhook
   - `TOKEN_ENCRYPTION_KEY` — hub and processor (generate with `openssl rand -base64 32`)
   - NATS subjects/durables are fixed in code (`libs/nats-js/src/nats.constants.ts`); only `NATS_URL` is configured per environment

5. **Deploy** each service. Watch paths in each `railway.toml` limit rebuilds to the relevant app plus `libs/`.

## Health checks

Nest apps expose `GET /` → `{ "status": "ok" }` (`healthcheckPath = "/"`).

NATS: set service variable `PORT=8222` so Railway hits `GET /healthz` on the HTTP monitor (see `docs/env/nats.env.example`). Client apps still use `NATS_URL` on port `4222`.

## Local parity

```bash
yarn install
yarn build:hub && yarn start:hub:prod
yarn build:webhook && yarn start:webhook:prod
yarn build:processor && yarn start:processor:prod
```

Merge `docs/env/shared.env.example` with each service file into a single `.env` at the repo root for `yarn start:hub:dev`, etc.
