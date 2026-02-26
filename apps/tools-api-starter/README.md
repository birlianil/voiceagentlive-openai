# tools-api-starter

Production-oriented starter backend for VAly tool execution.

## Features

- Same endpoint surface as `db-mock`
- Postgres-backed persistence
- Redis/BullMQ queue for reliable webhook dispatch
- Optional bearer auth for service-to-service access
- Optional HMAC signing for outbound webhooks

## Run

From repo root:

```bash
npx pnpm@10.15.0 --filter tools-api-starter dev
```

Default port: `4011`.

## Required environment

- `PORT` or `TOOLS_API_STARTER_PORT` (default `4011`)
- `DATABASE_URL` (default `postgres://postgres:postgres@127.0.0.1:5432/va_voice`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`)

## Optional environment

- `TOOLS_API_CORS_ORIGIN` (default `*`)
- `TOOLS_API_REQUIRE_AUTH` (default `false`)
- `TOOLS_API_AUTH_TOKEN` (required if auth enabled)
- `TOOLS_WEBHOOK_URL` (if empty, events are stored but not delivered externally)
- `TOOLS_WEBHOOK_SECRET` (enables `x-signature`)
- `TOOLS_WEBHOOK_TIMEOUT_MS` (default `4000`)
- `TOOLS_WEBHOOK_MAX_ATTEMPTS` (default `5`)
- `TOOLS_WEBHOOK_BACKOFF_MS` (default `1000`)

## Webhook headers

When webhook dispatch is enabled, outbound requests include:

- `x-event-type`
- `x-timestamp`
- `x-signature` (when secret is set)

Signature format:

- `v1=<hex_hmac_sha256(secret, timestamp + '.' + raw_body)>`

## Internal inspection endpoint

- `GET /internal/events?limit=100`

Returns recent tool events and statuses (`queued`, `retrying`, `delivered`, `failed`).
