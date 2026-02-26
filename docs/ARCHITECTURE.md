# Architecture

## Goal

Deliver a real-time VA-focused voice assistant over LiveKit that can:

- Answer VA-related questions with a system prompt policy.
- Call backend tools for search, contact capture, appointment flows, and call actions.
- Run with OpenAI STT/TTS/LLM or local STT/TTS fallback services.

## High-level topology

```mermaid
flowchart LR
  caller["Caller (LiveKit Meet)"] --> livekit["LiveKit Server (:7880)"]
  token["Token Server (:3000)"] --> livekit
  livekit --> worker["Agent Worker (Node + LiveKit Agents)"]
  worker --> openai["OpenAI APIs (LLM/STT/TTS)"]
  worker --> stt["Local STT Service (:4020)"]
  worker --> tts["Local TTS Service (:4030)"]
  worker --> db["Tool Backend API (:4010)"]
```

## Component map

| Component | Responsibility | Code |
| --- | --- | --- |
| Token server | Issues JWT token, dispatches agent to room | `apps/token-server/src/index.ts` |
| LiveKit server | WebRTC signaling/media routing, worker dispatch | `docker-compose.yml` |
| Agent worker | LLM orchestration, STT/TTS, tool invocation, session lifecycle | `apps/agent-worker/src/agent.ts` |
| DB API mock | Tool endpoints for search/contact/appointments/calendar/retell actions | `apps/db-mock/src/index.ts` |
| Prompt | Behavioral policy and scope | `apps/agent-worker/prompt.md` |

## End-to-end runtime flow

1. Client requests token from `/token`.
2. Token server injects `RoomAgentDispatch` with `agentName`.
3. Caller joins room in LiveKit Meet using issued token.
4. LiveKit dispatches job to agent worker.
5. Agent session starts, loads prompt, and starts VAD turn handling.
6. User speech transcribes (OpenAI STT or local fallback).
7. LLM generates response and optionally tool calls.
8. Tool calls hit backend endpoints, outputs return to LLM.
9. Final text is synthesized to speech (OpenAI TTS or local fallback).
10. Audio plays back to caller.

## Tool call sequence

```mermaid
sequenceDiagram
  participant U as User
  participant A as Agent Session
  participant L as LLM
  participant T as Tool Executor
  participant B as Backend API

  U->>A: Spoken request
  A->>L: Transcribed text + prompt context
  L-->>A: Tool call request (if needed)
  A->>T: Validate args (Zod) and execute
  T->>B: HTTP request (dbGet/dbPost)
  B-->>T: JSON result
  T-->>L: Tool output
  L-->>A: Final spoken response text
  A-->>U: TTS audio reply
```

## Current tool surface

Defined in `apps/agent-worker/src/agent.ts`:

- `db_search`
- `save_contact`
- `create_appointment`
- `check_availability_cal`
- `book_appointment_cal`
- `send_call_summary_email`
- `transfer_call`
- `press_digit_medrics`
- `end_call`

Backed by endpoints in `apps/db-mock/src/index.ts`:

- `GET /search`
- `POST /contact`
- `POST /appointments`
- `POST /calendar/availability`
- `POST /calendar/book`
- `POST /retell/send_call_summary_email`
- `POST /retell/transfer_call`
- `POST /retell/press_digit_medrics`
- `POST /retell/end_call`

## Session and logging hooks

`AgentSession` event listeners already log:

- Final STT: `[agent-session:stt] ...`
- Agent/user state transitions.
- Tool execution summary: `[agent-session:tools] ...`
- Session errors: `[agent-session:error] ...`

These are the primary signals for validating tool behavior and conversational stability.

## Known operational behavior from latest test

- Core flow is stable: room join, STT, tool path, TTS all worked.
- Under rapid barge-in, frequent interruptions can produce:
  - `Request was aborted` in TTS path.
  - `MaxListenersExceededWarning` warnings.
- Mitigation is primarily voice tuning (documented in `TUNING.md`).
