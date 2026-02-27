# Short Summary (Shareable)

## What this system is

A LiveKit-based real-time voice agent for VA-related conversations, with tool calling to backend endpoints for search, appointments, and call-control actions.

This repo now also includes a distribution-ready developer kit:

- JS/TS SDK: `packages/va-platform-sdk`
- OpenAPI contracts: `openapi/`
- Team-specific integration/runbook docs: `docs/`
- Backend starter service: `apps/tools-api-starter`

## Core runtime path

1. Token issued by `token-server` (`/token`).
2. Caller joins room in LiveKit Meet.
3. LiveKit dispatches `db-agent` worker.
4. Agent runs prompt policy + STT/LLM/TTS.
5. Tools call backend endpoints and feed outputs back to the model.

## Important current decisions

- Calendar tools are active.
- `press_digit_get` is removed.
- `press_digit_medrics` is active.
- Prompt updated to avoid placeholder values being sent as literal tool arguments.
- Token server supports API key protection + rate limiting.
- Tools starter uses Postgres + Redis/BullMQ with outbox retries.
- Worker can call tools backend with bearer token (`DB_API_AUTH_TOKEN`).
- Knowledge retrieval now uses tool-RAG (`/kb/ingest` + `/kb/search`) with citations.

## Stability profile

Voice profile is tuned for fast interruption (barge-in) with acceptable stability:

- `VOICE_MIN_INTERRUPTION_DURATION_MS=120`
- `VOICE_MIN_INTERRUPTION_WORDS=0`
- `VOICE_FORCE_ZERO_INTERRUPTION_WORDS_FOR_OPENAI_STT=true`
- `VOICE_MIN_ENDPOINTING_DELAY_MS=200`
- `VOICE_MAX_ENDPOINTING_DELAY_MS=900`

## Where developers should start

- System overview: `docs/ARCHITECTURE.md`
- End-to-end packaging blueprint: `docs/PRODUCTIZATION_E2E.md`
- Tuning and ops: `docs/TUNING.md`
- Prompt/tool/endpoint integration: `docs/INTEGRATION_GUIDE.md`
