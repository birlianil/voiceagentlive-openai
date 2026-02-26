# LiveKit + OpenAI Voice Agent (Scenario 2)

This branch runs the assistant with:

- LiveKit server (local, Docker)
- Agent worker (Node/TypeScript)
- OpenAI cloud LLM (`gpt-4o-mini` by default)
- Local STT service (faster-whisper)
- Local TTS service (Piper)
- Tool/API backend (`db-mock`) for search/contact/appointment actions
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

- `GET /search?q=...`
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
