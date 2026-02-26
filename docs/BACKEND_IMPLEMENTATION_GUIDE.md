# Backend Implementation Guide

## Purpose

`apps/tools-api-starter` is now a production-oriented baseline service for VAly tool calls:

- Express API with request IDs and CORS controls
- Postgres persistence for contacts, appointments, events, outbox
- Tool-based RAG endpoints (`/kb/ingest`, `/kb/search`, `/kb/documents`)
- Redis/BullMQ queue worker for webhook delivery retries
- Optional bearer auth for service-to-service protection

## Local bootstrap (backend team)

```bash
npx pnpm@10.15.0 install
docker compose --profile tools up -d postgres redis tools-api-starter
```

Set in root `.env`:

```env
DB_API_BASE_URL=http://127.0.0.1:4011
TOOLS_API_REQUIRE_AUTH=true
TOOLS_API_AUTH_TOKEN=change-me-tools-token
DB_API_AUTH_TOKEN=change-me-tools-token
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/va_voice
REDIS_URL=redis://127.0.0.1:6379
KB_ENABLED=true
KB_EMBEDDING_MODEL=text-embedding-3-small
KB_TOP_K=5
```

## Core modules

- `apps/tools-api-starter/src/index.ts`
  - HTTP routes, auth middleware, request ID propagation
  - Retell tool calls enqueue outbox work
- `apps/tools-api-starter/src/db.ts`
  - DB schema bootstrap and repository methods
- `apps/tools-api-starter/src/queue.ts`
  - BullMQ queue + worker registration
- `apps/tools-api-starter/src/webhook.ts`
  - outbound webhook dispatch and optional HMAC signing
- `apps/tools-api-starter/src/kb.ts`
  - chunking, embedding calls, and retrieval scoring helpers

## Data model

Minimum schema created on startup:

- `contacts(id, name, email, created_at)`
- `appointments(id, name, email, datetime_iso, appointment_type, facility, reason, created_at)`
- `tool_events(id, event_type, payload, status, created_at)`
- `outbox(id, event_id, event_type, destination, payload, status, retry_count, last_error, next_attempt_at, created_at)`
- `kb_documents(id, title, source, external_ref, metadata, content_hash, created_at, updated_at)`
- `kb_sections(id, document_id, chunk_index, content, metadata, embedding, created_at)`

## RAG flow

1. Ingest documents via `/kb/ingest` (chunks + optional embeddings).
2. Agent calls `/kb/search` for retrieval.
3. Backend performs keyword search and optional semantic rerank.
4. Response includes snippets and citation metadata.

## Event/outbox lifecycle

1. Tool endpoint accepts request and stores `tool_events(status=queued)`.
2. Outbox row is created with destination webhook URL.
3. BullMQ worker dequeues and delivers webhook.
4. On success: `outbox=status=delivered`, `tool_events=status=delivered`.
5. On failure: exponential retry until `TOOLS_WEBHOOK_MAX_ATTEMPTS`.
6. Max retries exceeded: `outbox=status=dead`, `tool_events=status=failed`.

## Security controls in baseline

- Bearer token auth (`TOOLS_API_REQUIRE_AUTH`, `TOOLS_API_AUTH_TOKEN`)
- Timing-safe token compare
- Helmet HTTP hardening
- CORS allowlist support (`TOOLS_API_CORS_ORIGIN`)
- Request IDs via `x-request-id`

## Contract

Keep endpoint response shapes aligned with:

- `openapi/tool-backend.yaml`

## Recommended next hardening

1. Add schema validation (zod/ajv) at route boundaries.
2. Add structured JSON logging with redaction rules.
3. Add metrics (`/metrics`) for queue depth, retry rate, and latency.
4. Move schema bootstrap to explicit migrations (Flyway/Prisma/Drizzle/Knex).
5. Add dead-letter replay tooling for outbox failures.
