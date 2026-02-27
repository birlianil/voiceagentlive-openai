# Voice Agent Developer Docs

This folder is the handoff package for developers who need to understand, operate, and extend the VA voice agent.

## Reading order

1. `GENERAL_GUIDE.md` for prerequisites, system flow, and role-based doc routing.
2. `SUMMARY_SHORT.md` for a quick shareable overview.
3. `PRODUCTIZATION_E2E.md` for end-to-end packaging and team handoff.
4. `ARCHITECTURE.md` for system topology, call flow, and tool lifecycle.
5. `DEPLOYMENT_RUNBOOK.md` for infra setup, health checks, and incident handling.
6. `BACKEND_IMPLEMENTATION_GUIDE.md` for backend team setup and productionization.
7. `INTEGRATION_GUIDE.md` for prompt changes, new tools, and endpoint/webhook integration.
8. `CLIENT_REACT_NATIVE.md` for React Native integration.
9. `CLIENT_NATIVE.md` for Swift/Kotlin integration.
10. `TUNING.md` for the voice behavior profile and rationale.
11. `API_CONTRACTS.md` for OpenAPI contracts and webhook patterns.
12. `SDK_PUBLISHING.md` for private registry publishing.
13. `REPO_SPLIT.md` for optional multi-repo release strategy.
14. `SPLIT_REPOS_INDEX.md` for current split repo links and sync commands.

## Fast path by team

| Team | Start here | Next |
| --- | --- | --- |
| Backend/API | `GENERAL_GUIDE.md` | `BACKEND_IMPLEMENTATION_GUIDE.md`, `API_CONTRACTS.md`, `INTEGRATION_GUIDE.md` |
| React Native | `GENERAL_GUIDE.md` | `CLIENT_REACT_NATIVE.md`, `API_CONTRACTS.md` |
| Native iOS/Android | `GENERAL_GUIDE.md` | `CLIENT_NATIVE.md`, `API_CONTRACTS.md` |
| DevOps/SRE | `GENERAL_GUIDE.md` | `DEPLOYMENT_RUNBOOK.md`, `TUNING.md` |
| Product/QA | `SUMMARY_SHORT.md` | `ARCHITECTURE.md`, `PRODUCTIZATION_E2E.md` |

## Source of truth in code

- Agent runtime and tools: `apps/agent-worker/src/agent.ts`
- Agent worker bootstrap: `apps/agent-worker/src/server.ts`
- Token issuance and dispatch: `apps/token-server/src/index.ts`
- Mock backend endpoints: `apps/db-mock/src/index.ts`
- Production backend starter: `apps/tools-api-starter/src/index.ts`
- Prompt content: `apps/agent-worker/prompt.md`
- Runtime env defaults: `.env.example`
- JS SDK: `packages/va-platform-sdk`
- API contracts: `openapi/token-server.yaml`, `openapi/tool-backend.yaml`
- Developer kit packager: `scripts/release/package-developer-kit.sh`
