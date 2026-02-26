# Token Server

Issues LiveKit access tokens and dispatches the configured agent into room config.

## Responsibilities

- Exposes `/token` and `/token/raw`
- Signs JWT with LiveKit credentials
- Injects `RoomAgentDispatch` with `AGENT_NAME`

## Run

```bash
pnpm --filter token-server dev
```

## Build

```bash
pnpm --filter token-server build
```

## Endpoints

- `GET /health`
- `GET /token?room=<room>&identity=<identity>&ttl=<ttl>`
- `GET /token/raw?room=<room>&identity=<identity>&ttl=<ttl>`

## Required env

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `AGENT_NAME`
- `TOKEN_SERVER_PORT`
