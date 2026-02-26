# Productization Blueprint (End-to-End)

## Scope

This repository is now structured as a deployable platform bundle for:

- Voice agent runtime team
- Backend/tool integration team
- Mobile frontend teams (React Native, Swift, Android)
- DevOps/SRE team

## What is included

- Runtime services:
  - `apps/agent-worker`
  - `apps/token-server`
  - `apps/db-mock` (replaceable with real backend)
- Platform SDK:
  - `packages/va-platform-sdk`
- API contracts:
  - `openapi/token-server.yaml`
  - `openapi/tool-backend.yaml`
- Deployment and integration docs:
  - `docs/*`
- Developer-kit packaging script:
  - `scripts/release/package-developer-kit.sh`

## System model

```mermaid
flowchart LR
  subgraph clients[Client Apps]
    rn[React Native App]
    ios[iOS Swift App]
    andr[Android App]
  end

  rn --> token
  ios --> token
  andr --> token

  token[Token Server] --> livekit[LiveKit Server]
  livekit --> worker[Agent Worker]
  worker --> openai[OpenAI APIs]
  worker --> backend[Tool Backend API]

  sdk[@va-platform/voice-sdk] -. used by .-> rn
  sdk -. used by .-> token
```

## Mandatory production services

1. LiveKit server (self-hosted or LiveKit Cloud)
2. Token server (JWT issuance + agent dispatch)
3. Agent worker (LLM/STT/TTS + tool orchestration)
4. Tool backend API (business integrations)

Without LiveKit server, realtime room connection cannot run.

## Deployment options

1. Single-environment (small team)
- Deploy all services in one VPC/cluster.

2. Split runtime (recommended)
- `token-server` + `backend` in API tier.
- `agent-worker` in compute tier (autoscaled).
- LiveKit managed/cloud or dedicated node pool.

3. Managed LiveKit + custom backend
- Keep your token server and worker.
- Point `LIVEKIT_URL` to managed endpoint.

## Team handoff matrix

| Team | Needs | Source |
| --- | --- | --- |
| React Native | Token fetch + room connection | `docs/CLIENT_REACT_NATIVE.md` |
| iOS/Android native | Token fetch + platform SDK setup | `docs/CLIENT_NATIVE.md` |
| Backend | Tool endpoint contracts | `openapi/tool-backend.yaml` |
| DevOps | Ports, env, readiness, scaling | `docs/DEPLOYMENT_RUNBOOK.md` |
| Platform | SDK distribution | `packages/va-platform-sdk` |

## Release flow for internal distribution

1. Merge to stable branch.
2. Build all packages: `pnpm build`.
3. Create developer bundle: `pnpm pack:devkit`.
4. Share generated tarball from `dist/`.
5. Publish SDK package (private npm/GitHub Packages) if needed.

CI automation:

- Workflow: `.github/workflows/developer-kit.yml`
- Trigger: push to `main`/`codex/**` or manual dispatch
- Output: downloadable `va-voice-developer-kit` artifact

## Quality gates before release

- Build passes (`pnpm build`).
- Token endpoint returns valid token.
- LiveKit room join test successful.
- At least one tool call path validated.
- Docs updated when tool schema changes.

## Next productization step (recommended)

- Replace `apps/db-mock` with production integration service while keeping the same API contract.
- Add CI pipeline for OpenAPI lint + SDK build + smoke tests.
