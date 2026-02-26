# Agent Worker

LiveKit Agents worker that runs VAly voice assistant logic.

## Responsibilities

- Loads system prompt and runtime voice settings
- Runs STT -> LLM -> TTS turn pipeline
- Executes tools against `DB_API_BASE_URL`
- Emits session/tool/error logs for observability

## Run

```bash
pnpm --filter agent-worker dev
```

## Build

```bash
pnpm --filter agent-worker build
```

## Key files

- `src/server.ts` worker bootstrap
- `src/agent.ts` core agent logic and tool definitions
- `prompt.md` assistant policy prompt

## Required env

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `OPENAI_API_KEY`
- `DB_API_BASE_URL`
