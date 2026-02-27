# General Developer Guide

## Purpose

This is the fastest starting point for new developers.
It explains:

- what the system does,
- how it works end to end,
- required setup,
- which document each team should read next.

## What the system does

VAly is a LiveKit-based real-time voice agent platform for VA-focused conversations.
It provides:

- realtime voice sessions (caller + agent),
- tool calling for backend actions (search, appointments, call flow),
- KB retrieval (`/kb/search`) for grounded answers,
- production handoff docs and SDK for client/backend teams.

## End-to-end flow (short)

1. Client requests a token from `token-server` (`/token`).
2. Client joins a LiveKit room with that token.
3. LiveKit dispatches `db-agent` to `agent-worker`.
4. `agent-worker` runs STT -> LLM -> TTS loop.
5. When needed, `agent-worker` calls backend tools (`/kb/search`, `/calendar/*`, etc.).
6. Backend responds with structured JSON.
7. Agent speaks the final response to the caller.

## Requirements

Required:

- Node.js 20+
- npm 10+ (or `npx pnpm@10.15.0`)
- Docker + Docker Compose
- OpenAI API key
- LiveKit API key/secret (for token issuance/dispatch)

Optional (production-oriented backend mode):

- Postgres
- Redis
- Supabase Postgres (alternative to self-hosted Postgres)

## Local quick start

1. Copy env file:

```bash
cp .env.example .env
```

2. Set at least:

- `OPENAI_API_KEY`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

3. Start infra:

```bash
docker compose up -d --build
```

4. Install dependencies:

```bash
npx pnpm@10.15.0 install
```

5. Run runtime services:

```bash
npx pnpm@10.15.0 dev
```

6. Get token:

`http://127.0.0.1:3000/token?room=test_room&identity=anil`

7. Join from LiveKit Meet:

- `https://meet.livekit.io`
- server URL: `ws://127.0.0.1:7880`

## Which doc should I read?

| Team | Read first | Then read |
| --- | --- | --- |
| Backend/API | `BACKEND_IMPLEMENTATION_GUIDE.md` | `INTEGRATION_GUIDE.md`, `API_CONTRACTS.md` |
| React Native | `CLIENT_REACT_NATIVE.md` | `API_CONTRACTS.md`, `PRODUCTIZATION_E2E.md` |
| Native iOS/Android | `CLIENT_NATIVE.md` | `API_CONTRACTS.md`, `PRODUCTIZATION_E2E.md` |
| DevOps/SRE | `DEPLOYMENT_RUNBOOK.md` | `TUNING.md`, `ARCHITECTURE.md` |
| Platform/SDK | `SDK_PUBLISHING.md` | `PRODUCTIZATION_E2E.md`, `REPO_SPLIT.md` |
| Product/QA | `SUMMARY_SHORT.md` | `ARCHITECTURE.md`, `INTEGRATION_GUIDE.md` |

## Change map (where to edit)

- System prompt: `apps/agent-worker/prompt.md`
- Agent tools and call logic: `apps/agent-worker/src/agent.ts`
- Tools backend routes: `apps/tools-api-starter/src/index.ts`
- Retrieval logic: `apps/tools-api-starter/src/db.ts`
- Token flow: `apps/token-server/src/index.ts`
- Env defaults: `.env.example`
- Contracts: `openapi/token-server.yaml`, `openapi/tool-backend.yaml`

## Release checklist

Before sharing a new version:

1. `npx pnpm@10.15.0 build` passes.
2. `/token` returns a valid token.
3. Live voice room connects and responds.
4. At least one `db_search` call succeeds in logs.
5. Docs are updated if prompt/tools/contracts changed.
