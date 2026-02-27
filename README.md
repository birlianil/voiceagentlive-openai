# LiveKit + OpenAI Voice Agent (Scenario 2)

This branch runs the assistant with:

- LiveKit server (local, Docker)
- Agent worker (Node/TypeScript)
- OpenAI cloud LLM (`gpt-4o-mini` by default)
- OpenAI cloud STT (`gpt-4o-mini-transcribe`) and TTS (`gpt-4o-mini-tts`) by default
- Optional local STT/TTS fallback services (`apps/stt-svc`, `apps/tts-svc`)
- Tool/API backend (`db-mock` dev default or `tools-api-starter` production baseline)
- Token server for browser joins + agent dispatch

## Project layout

- `docker-compose.yml`
- `.env.example`
- `docs/`
- `apps/agent-worker`
- `apps/token-server`
- `apps/db-mock`
- `apps/tools-api-starter`
- `apps/stt-svc`
- `apps/tts-svc`
- `packages/va-platform-sdk`
- `openapi/`
- `scripts/release/`

## Documentation

- Developer index: `docs/README.md`
- General guide (where to start by team): `docs/GENERAL_GUIDE.md`
- Architecture + diagrams: `docs/ARCHITECTURE.md`
- Productization blueprint: `docs/PRODUCTIZATION_E2E.md`
- Deployment runbook: `docs/DEPLOYMENT_RUNBOOK.md`
- Tuning profile and rationale: `docs/TUNING.md`
- Backend implementation guide: `docs/BACKEND_IMPLEMENTATION_GUIDE.md`
- Prompt/tool integration guide: `docs/INTEGRATION_GUIDE.md`
- API contracts and webhooks: `docs/API_CONTRACTS.md`
- React Native integration: `docs/CLIENT_REACT_NATIVE.md`
- Native iOS/Android integration: `docs/CLIENT_NATIVE.md`
- SDK publishing guide: `docs/SDK_PUBLISHING.md`
- Optional multi-repo split: `docs/REPO_SPLIT.md`
- Current split repo links: `docs/SPLIT_REPOS_INDEX.md`
- Short shareable summary: `docs/SUMMARY_SHORT.md`

## 1) Environment

```bash
cp .env.example .env
```

Set at least:

- `OPENAI_API_KEY`

Prompt file (editable):

- `apps/agent-worker/prompt.md`

You can also override prompt by env:

- `AGENT_SYSTEM_PROMPT`

## 2) Start Docker services

```bash
docker compose up -d --build
```

Note: `ollama` service is optional and disabled by default profile in this branch.
By default this starts the OpenAI STT/TTS path (no local STT/TTS containers).

Optional local STT/TTS fallback services (only if `USE_OPENAI_STT=false` and/or `USE_OPENAI_TTS=false`):

```bash
docker compose --profile local-audio up -d stt-svc tts-svc
```

Optional production-oriented backend starter (includes Postgres + Redis):

```bash
docker compose --profile tools up -d postgres redis tools-api-starter
```

If you still want ollama for experiments:

```bash
docker compose --profile ollama up -d ollama
```

## 3) Install JS dependencies

If `pnpm` is not globally installed:

```bash
npx pnpm@10.15.0 install
```

If `pnpm` is installed:

```bash
pnpm install
```

## 4) Run token server + agent worker

```bash
pnpm dev
```

or

```bash
npx pnpm@10.15.0 dev
```

If you want to run the production-oriented tool backend starter in the same terminal flow:

```bash
npx pnpm@10.15.0 dev:with-tools-starter
```

Then set in `.env`:

- `DB_API_BASE_URL=http://127.0.0.1:4011`
- `DB_API_AUTH_TOKEN=<TOOLS_API_AUTH_TOKEN>` if `TOOLS_API_REQUIRE_AUTH=true`

For balanced barge-in (fast but with fewer false cuts) on OpenAI STT path, keep:

- `VOICE_ALLOW_INTERRUPTIONS=true`
- `VOICE_MIN_INTERRUPTION_DURATION_MS=120`
- `VOICE_MIN_INTERRUPTION_WORDS=0`
- `VOICE_FORCE_ZERO_INTERRUPTION_WORDS_FOR_OPENAI_STT=true`
- `VOICE_MIN_ENDPOINTING_DELAY_MS=200`
- `VOICE_MAX_ENDPOINTING_DELAY_MS=900`

## 5) Get token

```text
http://127.0.0.1:3000/token?room=test_room&identity=anil
```

If token API key protection is enabled (`TOKEN_SERVER_REQUIRE_API_KEY=true`), send `x-api-key`.

## 6) Join with LiveKit Meet

- URL: <https://meet.livekit.io>
- Server URL: `ws://127.0.0.1:7880`
- Paste token and join

## Tool endpoints used by the agent

- `POST /kb/search` (primary RAG retrieval path)
- `POST /contact`
- `POST /appointments`
- `POST /calendar/availability`
- `POST /calendar/book`
- `POST /retell/send_call_summary_email`
- `POST /retell/transfer_call`
- `POST /retell/press_digit_medrics`
- `POST /retell/end_call`

Base URL: `DB_API_BASE_URL`

Production-oriented backend starter default URL: `http://127.0.0.1:4011`

## Knowledge base (RAG) quick start

Ingest a document:

```bash
curl -X POST http://127.0.0.1:4011/kb/ingest \
  -H "content-type: application/json" \
  -d '{
    "title":"VA Home Loan Basics",
    "source":"va.gov",
    "content":"VA home loan guaranty helps eligible Veterans buy, build, repair, or refinance a home.",
    "embed": true
  }'
```

Search the KB:

```bash
curl -X POST http://127.0.0.1:4011/kb/search \
  -H "content-type: application/json" \
  -d '{"query":"What is VA home loan guaranty?"}'
```

Ingest from a local file:

```bash
npx pnpm@10.15.0 kb:ingest:file --file ./my-docs/va-benefits.md --source local-docs --embed true
```

## Supabase setup (recommended production DB)

You do not need to upload files into this repo to test. You can push raw text (curl) or use the local file ingest script above.

For Supabase-backed RAG:

1. Create a Supabase project and get Postgres connection string (`sslmode=require`).
2. Set in `.env`:

```env
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DATABASE_URL=${SUPABASE_DB_URL}
KB_ENABLED=true
OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>
```

3. Start tools backend:

```bash
docker compose --profile tools up -d --build redis tools-api-starter
```

4. Ingest and query with `/kb/ingest` and `/kb/search`.

## SDK and API contracts

- JS/TS SDK package: `packages/va-platform-sdk`
- OpenAPI contracts:
  - `openapi/token-server.yaml`
  - `openapi/tool-backend.yaml`

## Developer kit packaging

```bash
pnpm pack:devkit
```

Creates a distributable bundle under `dist/`.

## Build

```bash
pnpm build
```

(or `npx pnpm@10.15.0 build`)
