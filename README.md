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
- `apps/stt-svc`
- `apps/tts-svc`

## Documentation

- Developer index: `docs/README.md`
- Architecture + diagrams: `docs/ARCHITECTURE.md`
- Tuning profile and rationale: `docs/TUNING.md`
- Prompt/tool integration guide: `docs/INTEGRATION_GUIDE.md`
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

## 5) Get token

```text
http://127.0.0.1:3000/token?room=test_room&identity=anil
```

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

## Build

```bash
pnpm build
```

(or `npx pnpm@10.15.0 build`)
