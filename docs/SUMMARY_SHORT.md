# Short Summary (Shareable)

## What this system is

A LiveKit-based real-time voice agent for VA-related conversations, with tool calling to backend endpoints for search, appointments, and call-control actions.

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

## Stability profile

Voice interruption thresholds were increased to reduce false interrupts and TTS abort churn:

- `VOICE_MIN_INTERRUPTION_DURATION_MS=500`
- `VOICE_MIN_INTERRUPTION_WORDS=2`
- `VOICE_MIN_ENDPOINTING_DELAY_MS=500`
- `VOICE_MAX_ENDPOINTING_DELAY_MS=3000`

## Where developers should start

- System overview: `docs/ARCHITECTURE.md`
- Tuning and ops: `docs/TUNING.md`
- Prompt/tool/endpoint integration: `docs/INTEGRATION_GUIDE.md`
