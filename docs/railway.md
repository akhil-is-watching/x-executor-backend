# Railway deployment

This monorepo runs multiple NestJS apps plus a NATS server from one repository. Railway does **not** support multiple services in a single `railway.toml`; create **one Railway service per row** and point each at its config file under `docs/railway/`.

| Service   | Config file                            | Deploy |
|-----------|----------------------------------------|--------|
| Hub       | `/docs/railway/hub/railway.toml`       | `yarn start:hub:prod` |
| Webhook   | `/docs/railway/webhook/railway.toml`   | `yarn start:webhook:prod` |
| Processor | `/docs/railway/processor/railway.toml` | `yarn start:processor:prod` |
| Sender    | `/docs/railway/sender/railway.toml`    | `yarn start:sender:prod` |
| Scheduler | `/docs/railway/scheduler/railway.toml` | `yarn start:scheduler:prod` |
| Analytics | `/docs/railway/analytics/railway.toml` | `yarn start:analytics:prod` |
| NATS      | `/docs/railway/nats-js/railway.toml`   | Docker (`nats:2.10-alpine` + JetStream) |

Environment templates live in `docs/env/`:

- `shared.env.example` — MongoDB, Redis, NATS URL placeholders
- `nats.env.example` — NATS server (`NATS_URL` only; routing is in `libs/nats-js/src/nats.constants.ts`)
- `hub.env.example` — OAuth, JWT, public URLs
- `webhook.env.example` — webhook base URL, X secret
- `processor.env.example` — GetXAPI, OpenAI, encryption key
- `sender.env.example` — GetXAPI, encryption key
- `scheduler.env.example` — campaign send pacing limits
- `analytics.env.example` — campaign stats consumer

For local development, the root `.env.example` still lists all variables in one file.

## Setup

1. **Create a Railway project** and connect this GitHub repo (root directory `/` for all services).

2. **Add data stores** (Railway plugins or external):
   - MongoDB → `MONGODB_URI`
   - Redis → `REDIS_URL` on **Hub** and **Processor** (see [Redis auth](#redis-auth) below)
   - NATS → deploy with `docs/railway/nats-js/railway.toml` (see below)

3. **Create services** (NATS, Hub, Webhook, Processor, Sender, Scheduler, Analytics). For each:
   - **Settings → Config file**: set the absolute path from the table above (paths are from repo root, not a root-directory override).
   - **Settings → Networking**: generate a public domain for **Hub** and **Webhook** only. Keep **NATS**, **Processor**, **Sender**, **Scheduler**, **Analytics**, and optionally MongoDB/Redis private.
   - **NATS only**: add a [volume](https://docs.railway.com/guides/volumes) mounted at `/data` so JetStream file storage survives redeploys. Set `PORT=8222` for healthchecks (from `docs/env/nats.env.example`).
   - **Variables**: copy from `docs/env/shared.env.example` plus the matching service file. Use Railway [reference variables](https://docs.railway.com/develop/variables#reference-variables) for cross-service URLs, for example:
     ```bash
     NATS_URL=nats://${{Nats.RAILWAY_PRIVATE_DOMAIN}}:4222
     HUB_PUBLIC_BASE_URL=https://${{Hub.RAILWAY_PUBLIC_DOMAIN}}
     WEBHOOK_PUBLIC_BASE_URL=https://${{Webhook.RAILWAY_PUBLIC_DOMAIN}}
     X_REDIRECT_URI=https://${{Hub.RAILWAY_PUBLIC_DOMAIN}}/xbot/v1/api/hub/oauth/x/callback
     ```
     Rename `Nats` in references to match your Railway service name.

4. **Shared secrets** must match across services:
   - `X_API_KEY_SECRET` — hub (OAuth 1.0a) and webhook CRC (`X_CONSUMER_SECRET` or `X_API_KEY_SECRET`)
   - `TOKEN_ENCRYPTION_KEY` — hub, processor, and sender (generate with `openssl rand -base64 32`)
   - NATS subjects/durables are fixed in code (`libs/nats-js/src/nats.constants.ts`); only `NATS_URL` is configured per environment

5. **Deploy** each service. Watch paths in each `railway.toml` limit rebuilds to the relevant app plus `libs/`.

## Health checks

Each Nest app exposes a service-specific health route → `{ "status": "ok" }` (see `healthcheckPath` in each `docs/railway/*/railway.toml`):

| Service | Path |
|---------|------|
| Hub | `GET /xbot/v1/api/hub/health` |
| Webhook | `GET /xbot/v1/api/webhook/health` |
| Processor | `GET /xbot/v1/api/processor/health` |
| Sender | `GET /xbot/v1/api/sender/health` |
| Scheduler | `GET /xbot/v1/api/scheduler/health` |
| Analytics | `GET /xbot/v1/api/analytics/health` |

NATS: set service variable `PORT=8222` so Railway hits `GET /healthz` on the HTTP monitor (see `docs/env/nats.env.example`). Client apps still use `NATS_URL` on port `4222`.

## X webhooks (single shared URL)

All connections use one ingress URL on the Webhook service:

`https://<webhook-service>/xbot/v1/api/webhook/incoming`

On each X OAuth (OAuth 1.0a 3-legged), Hub:

1. Registers that URL with X once (`POST /2/webhooks`) — idempotent (app bearer).
2. Subscribes the user (`POST /2/account_activity/webhooks/:config_id/subscriptions/all`) using OAuth 1.0a user tokens.
3. Stores a subscription row in MongoDB (`connection_webhooks`).

The Webhook app routes events by `for_user_id` in the payload (fans out if the same X user is linked to multiple orgs).

**Webhook must use the same `MONGODB_URI` as Hub** so `x_connections` rows exist for routing.

**No POSTs in Webhook logs?** Your URL is reachable if `GET /xbot/v1/api/webhook/health` and CRC work; silence means **X is not sending events** (not a Nest bug). Checklist:

1. In Developer Portal → **Webhooks**, confirm config `2062592785111478272` (or latest Hub log id) shows **Valid** — invalid webhooks receive no events ([docs](https://docs.x.com/x-api/webhooks/introduction)).
2. Re-OAuth after deploy (Hub logs `valid=true` and may trigger `PUT /2/webhooks/:id` CRC if invalid).
3. Test with a **favorite** on the subscribed account’s tweet ([quickstart](https://docs.x.com/x-api/account-activity/quickstart)), wait ~10s; watch Webhook for `HTTP POST /xbot/v1/api/webhook/incoming`.
4. **DMs:** some conversations use XChat encryption — X API sends **no webhook** for those ([known limitation](https://github.com/aws-samples/sample-amazon-connect-social-integration/blob/main/x_setup.md)).
5. Prove logging: signed POST test (replace `YOUR_API_KEY_SECRET`):

```bash
BODY='{"for_user_id":"1390625949587173378","tweet_create_events":[]}'
SIG=$(node -e "const c=require('crypto');const b=process.argv[1];const s=process.argv[2];console.log('sha256='+c.createHmac('sha256',s).update(b).digest('base64'))" "$BODY" "YOUR_API_KEY_SECRET")
curl -sS -X POST "https://webhook-x-executor.up.railway.app/xbot/v1/api/webhook/incoming" \
  -H "Content-Type: application/json" \
  -H "x-twitter-webhooks-signature: $SIG" \
  -d "$BODY"
```

You should see `HTTP POST` + `X webhook POST received` in Railway. If that works but real X events do not, the issue is X delivery (invalid webhook / wrong test / encrypted DM).

If you see `signature verification failed`, fix `X_CONSUMER_SECRET` on Webhook (= API Key Secret). If you see `No active connection for for_user_id=...`, re-OAuth so Hub stores the v2 user id that matches `for_user_id`.

## Processor not receiving NATS events

Webhook publishes to JetStream subject `x.webhook.received` after a successful POST. Processor consumes with durable `processor-webhook`.

**Expected logs**

| Service | Log line |
|---------|----------|
| Webhook | `Published x.webhook.received eventId=...` |
| Processor (startup) | `NATS JetStream ready` → `Consumer processor-webhook listening` |
| Processor (per event) | `NATS webhook event received` → then either `Skipping non-DM` or `Processing DM` |

**Checklist**

1. **Same `NATS_URL` on Webhook and Processor** — use the private NATS service reference on port **4222** (not `8222`):
   ```bash
   NATS_URL=nats://${{Nats.RAILWAY_PRIVATE_DOMAIN}}:4222
   ```
2. **Processor service is running** — it has no public URL; confirm deploy is healthy (`GET /xbot/v1/api/processor/health` on its internal port).
3. **Webhook shows NATS publish** — if you see `X webhook processed → 1 NATS event(s)` but no `Published x.webhook.received`, redeploy Webhook with latest code or check for publish errors in logs.
4. **Favorites / tweets are not DMs** — Processor **ignores** non-`direct_message_events` after logging `Skipping non-DM`. A favorite test proves Webhook → NATS → Processor; it will **not** run the DM/LLM pipeline.
5. **DM pipeline prerequisites** (after `Processing DM`): same `MONGODB_URI` as Hub, org **system prompt** set, connection **auth token** set in admin UI, `TOKEN_ENCRYPTION_KEY` matches Hub, GetXAPI/OpenAI/Redis env on Processor.
6. **XChat / encrypted DMs** — require connection **XChat PIN** in Hub admin UI (`hasXchatPin`); Processor needs `X_API_KEY` / `X_API_KEY_SECRET` (see [CREATE_AND_INTEGRATE_FRONTEND.md](./CREATE_AND_INTEGRATE_FRONTEND.md#dm-webhooks-legacy-dms-and-xchat)).

**Hub env (defaults on):**

- `X_API_KEY` / `X_API_KEY_SECRET` — Consumer Keys (OAuth 1.0a user connect + app bearer).
- `X_REDIRECT_URI` — OAuth 1.0a callback URL (also add in Developer Portal).
- `X_REGISTER_WEBHOOKS_WITH_X` — set to `false` to skip X API calls (local dev without AAAPI).
- `X_WEBHOOK_CONFIG_ID` — optional; skip `POST /2/webhooks` if you already know the config id.
- `WEBHOOK_PUBLIC_BASE_URL` — public HTTPS Webhook service (CRC + POST target).
- **Webhook service CRC:** set `X_CONSUMER_SECRET` to the **API Key Secret** (same as `X_API_KEY_SECRET`).

**CRC error `Invalid response_token`:** almost always wrong secret or wrong URL path. Register exactly `https://<webhook-host>/xbot/v1/api/webhook/incoming` (no trailing slash). On the **Webhook** Railway service, set `X_CONSUMER_SECRET` to the API Key Secret, redeploy, then re-validate in X console.

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
yarn build:sender && yarn start:sender:prod
yarn build:scheduler && yarn start:scheduler:prod
yarn build:analytics && yarn start:analytics:prod
```

Merge `docs/env/shared.env.example` with each service file into a single `.env` at the repo root for `yarn start:hub:dev`, etc.
