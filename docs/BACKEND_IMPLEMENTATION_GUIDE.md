# Backend Implementation Guide

## Purpose

This guide is for backend engineers who will turn the current tool backend into production services.

## Start point options

1. Mock baseline: `apps/db-mock`
- Fast local testing
- No validation depth, no persistence guarantees

2. Production starter: `apps/tools-api-starter`
- Endpoint validation and structured errors
- Optional signed webhook dispatch
- Clear replacement points for DB/queue providers

Recommended: start from `tools-api-starter`.

## Endpoint contract

Implement exactly per OpenAPI:

- `openapi/tool-backend.yaml`

Keep response envelopes stable to avoid breaking agent behavior and SDK clients.

## Local bootstrap for backend team

```bash
npx pnpm@10.15.0 install
pnpm --filter tools-api-starter dev
```

Then set in root `.env`:

```env
DB_API_BASE_URL=http://127.0.0.1:4011
```

## Production replacement checklist

1. Persistence layer
- Replace in-memory arrays with database repositories.
- Add migrations for contacts, appointments, event logs.

2. Outbound integrations
- Replace direct webhook call with queue worker pattern.
- Add retry policy and dead-letter queue.

3. Security
- Add service-to-service auth (JWT/mTLS).
- Validate and sanitize all inputs.
- Redact sensitive fields in logs.

4. Observability
- Add request IDs and structured logging.
- Export metrics for endpoint latency/error rates.

5. Reliability
- Add readiness/liveness probes.
- Add timeout and circuit-breaker strategy for external APIs.

## Suggested data model (minimum)

- `contacts(id, name, email, created_at)`
- `appointments(id, contact_id, datetime_iso, type, facility, reason, created_at)`
- `tool_events(id, event_type, payload_json, status, created_at)`
- `outbox(id, event_id, destination, status, retry_count, next_attempt_at)`

## Webhook signing reference

`tools-api-starter` signs with:

- Header `x-signature: v1=<hex_hmac_sha256(secret, timestamp + '.' + raw_body)>`
- Header `x-timestamp` (unix seconds)

Consumer services should verify both signature and timestamp freshness.

## Integration test targets

- `/health`
- `/calendar/availability`
- `/calendar/book`
- `/retell/send_call_summary_email`
- `/retell/transfer_call`

These are the highest-value paths for call flow continuity.
