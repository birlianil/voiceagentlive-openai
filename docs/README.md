# Voice Agent Developer Docs

This folder is the handoff package for developers who need to understand, operate, and extend the VA voice agent.

## Reading order

1. `ARCHITECTURE.md` for system topology, call flow, and tool lifecycle.
2. `TUNING.md` for the voice behavior profile and why specific values were chosen.
3. `INTEGRATION_GUIDE.md` for prompt changes, new tools, and endpoint/webhook integration.
4. `SUMMARY_SHORT.md` for a quick shareable overview.

## Source of truth in code

- Agent runtime and tools: `apps/agent-worker/src/agent.ts`
- Agent worker bootstrap: `apps/agent-worker/src/server.ts`
- Token issuance and dispatch: `apps/token-server/src/index.ts`
- Mock backend endpoints: `apps/db-mock/src/index.ts`
- Prompt content: `apps/agent-worker/prompt.md`
- Runtime env defaults: `.env.example`
