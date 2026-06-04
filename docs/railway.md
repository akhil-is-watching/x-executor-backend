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
   - Redis → `REDIS_URL` on **Hub** and **Processor** (see [Redis auth](#redis-auth) below)
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
   - `X_API_KEY_SECRET` — hub (OAuth 1.0a) and webhook CRC (`X_CONSUMER_SECRET` or `X_API_KEY_SECRET`)
   - `TOKEN_ENCRYPTION_KEY` — hub and processor (generate with `openssl rand -base64 32`)
   - NATS subjects/durables are fixed in code (`libs/nats-js/src/nats.constants.ts`); only `NATS_URL` is configured per environment

5. **Deploy** each service. Watch paths in each `railway.toml` limit rebuilds to the relevant app plus `libs/`.

## Health checks

Nest apps expose `GET /` → `{ "status": "ok" }` (`healthcheckPath = "/"`).

NATS: set service variable `PORT=8222` so Railway hits `GET /healthz` on the HTTP monitor (see `docs/env/nats.env.example`). Client apps still use `NATS_URL` on port `4222`.

## X webhooks (single shared URL)

All connections use one ingress URL on the Webhook service:

`https://<webhook-service>/api/v1/webhooks/incoming`

On each X OAuth (OAuth 1.0a 3-legged), Hub:

1. Registers that URL with X once (`POST /2/webhooks`) — idempotent (app bearer).
2. Subscribes the user (`POST /2/account_activity/webhooks/:config_id/subscriptions/all`) using OAuth 1.0a user tokens.
3. Stores a subscription row in MongoDB (`connection_webhooks`).

The Webhook app routes events by `for_user_id` in the payload (fans out if the same X user is linked to multiple orgs).

**Hub env (defaults on):**

- `X_API_KEY` / `X_API_KEY_SECRET` — Consumer Keys (OAuth 1.0a user connect + app bearer).
- `X_REDIRECT_URI` — OAuth 1.0a callback URL (also add in Developer Portal).
- `X_REGISTER_WEBHOOKS_WITH_X` — set to `false` to skip X API calls (local dev without AAAPI).
- `X_WEBHOOK_CONFIG_ID` — optional; skip `POST /2/webhooks` if you already know the config id.
- `WEBHOOK_PUBLIC_BASE_URL` — public HTTPS Webhook service (CRC + POST target).
- **Webhook service CRC:** set `X_CONSUMER_SECRET` to the **API Key Secret** (same as `X_API_KEY_SECRET`).

**CRC error `Invalid response_token`:** almost always wrong secret or wrong URL path. Register exactly `https://<webhook-host>/api/v1/webhooks/incoming` (no trailing slash). On the **Webhook** Railway service, set `X_CONSUMER_SECRET` to the API Key Secret, redeploy, then re-validate in X console.

Requires **Account Activity API** access on your X app. After deploy, re-connect X accounts; delete old per-user webhook configs in the Developer Console if any remain.

## Redis auth

Managed Redis (including Railway’s Redis plugin) returns `NOAUTH Authentication required` when the app connects without a password.

**Do this:** On Hub and Processor, set:

```bash
REDIS_URL=${{Redis.REDIS_URL}}
```

Use the **reference variable** from your Redis service name (`Redis` must match the service name in Railway). That URL already includes `default:<password>@host:port`.

**Do not** build the URL by hand, e.g. `redis://${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379` — that omits the password and causes `NOAUTH`.

If you must use a host-only URL, also set `REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}` (and optionally `REDIS_USERNAME=default`). The shared Redis client will inject credentials automatically.

## Slow Nest builds on Railway

Hub, Webhook, and Processor use webpack via `nest build`. The default Nest webpack setup runs `ForkTsCheckerWebpackPlugin`, which can take many minutes or appear stuck on small Railway builders.

This repo uses root `webpack.config.js` to compile with `transpileOnly` and skip fork-ts-checker during deploy builds. Type-check locally with `yarn test` / your IDE.

If a deploy log shows ~5 minutes before `nest build`, most of that is usually `yarn install`, not compilation.

## Local parity

```bash
yarn install
yarn build:hub && yarn start:hub:prod
yarn build:webhook && yarn start:webhook:prod
yarn build:processor && yarn start:processor:prod
```

Merge `docs/env/shared.env.example` with each service file into a single `.env` at the repo root for `yarn start:hub:dev`, etc.
