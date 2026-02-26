# Voice Agent Developer Docs

This folder is the handoff package for developers who need to understand, operate, and extend the VA voice agent.

## Reading order

1. `SUMMARY_SHORT.md` for a quick shareable overview.
2. `PRODUCTIZATION_E2E.md` for end-to-end packaging and team handoff.
3. `ARCHITECTURE.md` for system topology, call flow, and tool lifecycle.
4. `DEPLOYMENT_RUNBOOK.md` for infra setup, health checks, and incident handling.
5. `BACKEND_IMPLEMENTATION_GUIDE.md` for backend team setup and productionization.
6. `INTEGRATION_GUIDE.md` for prompt changes, new tools, and endpoint/webhook integration.
7. `CLIENT_REACT_NATIVE.md` for React Native integration.
8. `CLIENT_NATIVE.md` for Swift/Kotlin integration.
9. `TUNING.md` for the voice behavior profile and rationale.
10. `API_CONTRACTS.md` for OpenAPI contracts and webhook patterns.
11. `SDK_PUBLISHING.md` for private registry publishing.
12. `REPO_SPLIT.md` for optional multi-repo release strategy.
13. `SPLIT_REPOS_INDEX.md` for current split repo links and sync commands.

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
