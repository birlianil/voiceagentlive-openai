# tools-api-starter

Production-oriented starter backend for tool execution.

## Features

- Same endpoint surface as `db-mock` tool API
- Input validation and consistent error responses
- Optional outbound webhook dispatch with HMAC signature
- In-memory storage placeholders that backend teams can replace with DB/queue

## Run

```bash
pnpm --filter tools-api-starter dev
```

Default port: `4011`.

## Environment

- `PORT` or `TOOLS_API_STARTER_PORT` (default `4011`)
- `TOOLS_WEBHOOK_URL` optional outbound webhook target
- `TOOLS_WEBHOOK_SECRET` optional secret for HMAC signature
- `TOOLS_WEBHOOK_TIMEOUT_MS` webhook timeout in ms (default `4000`)

## Webhook headers

When webhook is enabled, outbound requests include:

- `x-event-type`
- `x-timestamp`
- `x-signature` (if secret is set)

Signature format:

- `v1=<hex_hmac_sha256(secret, timestamp + '.' + raw_body)>`

## Replace for production

Backend team should replace in-memory arrays with:

- Persistent database for contacts/appointments/events
- Queue-backed delivery for external integrations
- Retries and dead-letter queue for webhook dispatch
