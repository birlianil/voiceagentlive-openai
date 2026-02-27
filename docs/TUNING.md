# Voice Tuning Profile

## Why tuning was needed

In test calls, rapid overlap between caller and assistant created high interruption churn. The symptoms were:

- Frequent `speech interrupted` events.
- Intermittent OpenAI TTS abort messages (`Request was aborted`).
- Listener warning noise under heavy interrupt churn.

## Applied profile (current repo defaults)

Values are applied via environment configuration:

- `.env` (active runtime in this repository)
- `.env.example` (baseline for new environments)

`apps/agent-worker/src/agent.ts` still has fallback defaults if env values are missing.

| Setting | Previous | Current | Reason |
| --- | --- | --- | --- |
| `VOICE_MIN_INTERRUPTION_DURATION_MS` | `320` | `120` | Faster interruption when user starts speaking over TTS. |
| `VOICE_MIN_INTERRUPTION_WORDS` | `1` | `0` | Avoids waiting for delayed STT final words before interrupt. |
| `VOICE_FORCE_ZERO_INTERRUPTION_WORDS_FOR_OPENAI_STT` | `false` | `true` | Forces reliable barge-in behavior on OpenAI STT path. |
| `VOICE_MIN_ENDPOINTING_DELAY_MS` | `500` | `200` | Lowers perceived response start delay after user stops speaking. |
| `VOICE_MAX_ENDPOINTING_DELAY_MS` | `2200` | `900` | Prevents long turn-finalization waits on short pauses. |

## Practical effect

- Faster interruption when caller starts speaking over assistant.
- Lower chance that assistant keeps talking while user barge-ins.
- Higher sensitivity, so very short noises can still interrupt occasionally.

## When to tune further

If users report the assistant "cuts in too easily":

- Increase `VOICE_MIN_INTERRUPTION_DURATION_MS` first (for example `120 -> 200 -> 280`).
- Keep `VOICE_MIN_INTERRUPTION_WORDS=0` for OpenAI STT unless you accept slower barge-in.

If users report "assistant replies too slowly":

- Lower `VOICE_MIN_ENDPOINTING_DELAY_MS` in small steps (e.g., `200 -> 160`).

If users report "assistant keeps speaking while I talk":

- Set `VOICE_MIN_INTERRUPTION_WORDS=0` (critical on OpenAI STT path).
- Keep `VOICE_ALLOW_INTERRUPTIONS=true`.
- Lower `VOICE_MIN_INTERRUPTION_DURATION_MS` in small steps (e.g., `200 -> 160 -> 120`).

If long pauses are misread as turn end:

- Increase `VOICE_MAX_ENDPOINTING_DELAY_MS` (for example `900 -> 1200`).

## Suggested test protocol

1. Run a 5-10 minute mixed conversation.
2. Include normal pauses, intentional barge-in, and rapid short utterances.
3. Count:
   - Completed responses vs interrupted responses.
   - `agent-session:error` lines.
   - Tool success ratio (`[agent-session:tools]`).
4. Keep the profile that maximizes completed responses without noticeably increasing response latency.

## Research references

- LiveKit voice turns and interruption controls: [Turn Detection](https://docs.livekit.io/agents/build/turns/)
- LiveKit turn detection configuration semantics: [Configuration](https://docs.livekit.io/agents/v0/build/turn-detection/configuration/)
- LiveKit voice option fields/default references: [Voice API Reference](https://docs.livekit.io/reference/python/v1/livekit/agents/voice/index.html)
