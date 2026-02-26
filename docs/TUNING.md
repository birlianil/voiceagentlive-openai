# Voice Tuning Profile

## Why tuning was needed

In test calls, rapid overlap between caller and assistant created high interruption churn. The symptoms were:

- Frequent `speech interrupted` events.
- Intermittent OpenAI TTS abort messages (`Request was aborted`).
- Listener warning noise under heavy interrupt churn.

## Applied profile (current repo defaults)

Values are applied in both:

- `apps/agent-worker/src/agent.ts` (runtime defaults)
- `.env.example` (new environment baseline)

| Setting | Previous | Current | Reason |
| --- | --- | --- | --- |
| `VOICE_MIN_INTERRUPTION_DURATION_MS` | `280` | `320` | Preserves fast barge-in while filtering ultra-short noise. |
| `VOICE_MIN_INTERRUPTION_WORDS` | `1` | `0` | For OpenAI STT path, avoid waiting on delayed final transcripts. |
| `VOICE_MIN_ENDPOINTING_DELAY_MS` | `200` | `500` | Avoids early turn-close on brief pauses. |
| `VOICE_MAX_ENDPOINTING_DELAY_MS` | `900` | `2200` | Keeps turn finalization responsive without over-waiting. |

## Practical effect

- Faster interruption when caller starts speaking over assistant.
- Lower chance that assistant keeps talking while user barge-ins.
- Balanced against moderate false-interrupt protection.

## When to tune further

If users report the assistant "cuts in too easily":

- Increase `VOICE_MIN_INTERRUPTION_DURATION_MS` first.
- Keep `VOICE_MIN_INTERRUPTION_WORDS=0` for OpenAI STT unless you accept slower barge-in.

If users report "assistant replies too slowly":

- Lower `VOICE_MIN_ENDPOINTING_DELAY_MS` in small steps (e.g., 500 -> 400).

If users report "assistant keeps speaking while I talk":

- Set `VOICE_MIN_INTERRUPTION_WORDS=0` (critical on OpenAI STT path).
- Keep `VOICE_ALLOW_INTERRUPTIONS=true`.
- Lower `VOICE_MIN_INTERRUPTION_DURATION_MS` in small steps (e.g., 320 -> 260).

If long pauses are misread as turn end:

- Increase `VOICE_MAX_ENDPOINTING_DELAY_MS` (only relevant depending on turn detection mode).

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
