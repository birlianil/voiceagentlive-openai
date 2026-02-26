# API Contracts and Webhook Patterns

## Contract source

- Token API: `openapi/token-server.yaml`
- Tools API: `openapi/tool-backend.yaml`

These OpenAPI files are the canonical interface documents for client/server integration.
`apps/tools-api-starter` is the reference implementation baseline for these contracts.

## Versioning strategy

- Keep contract changes backward compatible when possible.
- Bump minor version for additive fields.
- Bump major version for breaking schema/path changes.

## Endpoint groups

1. Public client-facing
- `/token`
- `/token/raw`
- Optional header: `x-api-key` (when `TOKEN_SERVER_REQUIRE_API_KEY=true`)

2. Internal tool execution
- `/kb/ingest`
- `/kb/search`
- `/kb/documents`
- `/search` (legacy compatibility)
- `/contact`
- `/appointments`
- `/calendar/*`
- `/retell/*`
- `/internal/events` (operational visibility)
- Optional header: `Authorization: Bearer <token>` (when `TOOLS_API_REQUIRE_AUTH=true`)

## RAG retrieval pattern

1. Ingest source content through `/kb/ingest` (chunk + optional embeddings).
2. Agent calls `/kb/search` during conversation.
3. Backend runs keyword retrieval and optional semantic rerank.
4. Backend returns snippets + citations for model grounding.

## Webhook integration pattern

When tool actions must trigger external systems (CRM, ticketing, messaging):

1. Worker invokes tools API endpoint.
2. Tools API validates payload and persists an event record.
3. Tools API publishes event to queue/webhook dispatcher.
4. Dispatcher calls external webhook endpoint.
5. Tools API returns immediate ack to worker.

## Recommended response envelope

```json
{
  "ok": true,
  "id": "evt_20260226_001",
  "status": "queued"
}
```

## Webhook security

- Use signed webhook payloads (HMAC).
- Include `X-Signature` and timestamp.
- Reject stale timestamp windows.
- Use retry with backoff and dead-letter queue.

## Example outbound webhook payload

```json
{
  "eventType": "send_call_summary_email",
  "eventId": "evt_20260226_001",
  "createdAt": "2026-02-26T18:30:00Z",
  "payload": {
    "summary": "Caller requested VA home loan overview",
    "email": "example@domain.com"
  }
}
```
