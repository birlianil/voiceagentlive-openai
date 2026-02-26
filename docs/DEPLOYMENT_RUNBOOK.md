# Deployment Runbook

## Service inventory

| Service | Required | Port | Notes |
| --- | --- | --- | --- |
| LiveKit | Yes | 7880/7881/7882 | Realtime media/signaling |
| token-server | Yes | 3000 | LiveKit token minting + agent dispatch |
| agent-worker | Yes | worker process | Runs VAly orchestration + tools |
| db-mock | Optional (dev only) | 4010 | No persistence |
| tools-api-starter | Recommended | 4011 | Postgres + Redis backed + tool-RAG endpoints |
| Postgres | Required for starter | 5432 | Contacts/appointments/events/outbox |
| Redis | Required for starter webhook queue | 6379 | BullMQ queue and retries |
| stt-svc | Optional | 4020 | Only when `USE_OPENAI_STT=false` |
| tts-svc | Optional | 4030 | Only when `USE_OPENAI_TTS=false` |

## Minimum env vars

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `OPENAI_API_KEY`
- `DB_API_BASE_URL`
- `AGENT_NAME`

Security-related in production:

- `TOKEN_SERVER_REQUIRE_API_KEY=true`
- `TOKEN_SERVER_API_KEYS=<comma-separated-client-keys>`
- `TOOLS_API_REQUIRE_AUTH=true`
- `TOOLS_API_AUTH_TOKEN=<shared-token>`
- `DB_API_AUTH_TOKEN=<same-shared-token>`

## Local smoke deployment

```bash
docker compose up -d --build
docker compose --profile tools up -d postgres redis tools-api-starter
npx pnpm@10.15.0 install
npx pnpm@10.15.0 dev
```

Optional local fallback audio services:

```bash
docker compose --profile local-audio up -d stt-svc tts-svc
```

Use local fallback only when needed:

- `USE_OPENAI_STT=false` to use `stt-svc`
- `USE_OPENAI_TTS=false` to use `tts-svc`

Validate:

- `GET http://127.0.0.1:3000/health`
- `GET http://127.0.0.1:4011/health`
- `GET http://127.0.0.1:3000/token?room=test_room&identity=ops`
- `POST http://127.0.0.1:4011/kb/search` (with sample query)

If auth is enabled:

- token-server: send `x-api-key`
- tools API: send `Authorization: Bearer <token>`

## Recommended production topology

1. API gateway/WAF in front of token-server.
2. agent-worker as autoscaled stateless pool.
3. tools-api-starter behind private network with Postgres + Redis.
4. Secrets in managed vault (not `.env` in runtime).
5. TLS (`https://` + `wss://`) for all client-facing endpoints.

Supabase variant:

- Replace self-hosted Postgres with Supabase managed Postgres (`DATABASE_URL` / `SUPABASE_DB_URL`).
- Keep Redis for webhook queue unless you externalize queue provider.

## Health and readiness

- Liveness: `/health` on token-server and tools API.
- Queue health: Redis ping + BullMQ worker alive.
- Functional health: periodic token request + room join + tool call.

## Incident quick actions

1. Token failures:
- Verify `LIVEKIT_API_KEY/LIVEKIT_API_SECRET`.
- Verify client sends valid `x-api-key` when required.

2. Agent not joining room:
- Verify worker process alive.
- Verify `AGENT_NAME` matches token dispatch metadata.

3. Tool call failures:
- Verify `DB_API_BASE_URL`.
- Verify bearer auth token match (`DB_API_AUTH_TOKEN` vs `TOOLS_API_AUTH_TOKEN`).
- Verify Postgres and Redis health.

4. Webhook delivery failures:
- Inspect `/internal/events`.
- Inspect queue retry logs (`[outbox:failed]`).
- Check destination availability and HMAC secret mismatch.

## Security hardening checklist

- Enable API key protection on token-server.
- Enable bearer auth on tools backend.
- Restrict CORS origins (`TOKEN_SERVER_CORS_ORIGIN`, `TOOLS_API_CORS_ORIGIN`).
- Keep `OPENAI_API_KEY` server-side only.
- Redact sensitive fields in logs and traces.
