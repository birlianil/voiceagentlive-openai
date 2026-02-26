# Deployment Runbook

## Service inventory

| Service | Required | Port | Notes |
| --- | --- | --- | --- |
| LiveKit | Yes | 7880/7881/7882 | Realtime media/signaling |
| token-server | Yes | 3000 | JWT + agent dispatch |
| agent-worker | Yes | dynamic worker process | Connects to LiveKit + OpenAI + tools API |
| tool backend API | Yes | 4010 | Replace `db-mock` in production |
| stt-svc | Optional | 4020 | Needed when `USE_OPENAI_STT=false` |
| tts-svc | Optional | 4030 | Needed when `USE_OPENAI_TTS=false` |

## Minimum env vars

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `OPENAI_API_KEY`
- `DB_API_BASE_URL`
- `AGENT_NAME`

See `.env.example` for full list.

## Local smoke deployment

```bash
docker compose up -d --build
npx pnpm@10.15.0 install
npx pnpm@10.15.0 dev
```

Validate:

- `GET http://127.0.0.1:3000/health`
- `GET http://127.0.0.1:4010/health`
- `GET http://127.0.0.1:3000/token?room=test_room&identity=ops`

## Production topology recommendation

1. Deploy token-server behind API gateway.
2. Deploy agent-worker as autoscaled stateless service.
3. Deploy tool backend with database + queue integration.
4. Use managed secrets for OpenAI and LiveKit credentials.
5. Restrict tool backend to trusted network paths.

## Health and readiness

- Liveness: `/health` on token-server and backend.
- Worker readiness: monitor startup logs (`registered worker`).
- Functional health: run periodic token fetch + room join smoke test.

## Observability

Collect and index logs containing:

- `[agent-session:error]`
- `[agent-session:tools]`
- `[agent-session:stt]`
- Worker registration and disconnect events

Track metrics:

- Token request success rate
- Session start success rate
- Tool call success/error rate
- Average response latency

## Incident quick actions

1. Token failures: verify `LIVEKIT_API_KEY/SECRET`.
2. No agent in room: verify worker running and `AGENT_NAME` matches token-server dispatch.
3. Tool failures: verify `DB_API_BASE_URL`, backend health, payload schema.
4. Audio issues: verify LiveKit ports and TURN/network policy.

## Security hardening checklist

- Enforce HTTPS/WSS in all client-facing endpoints.
- Keep `OPENAI_API_KEY` server-side only.
- Add auth between token-server and external clients.
- Add auth between worker and tool backend.
- Redact sensitive logs.
