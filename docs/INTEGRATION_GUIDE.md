# Prompt, Tools, and Endpoint Integration Guide

## 1) How to change the system prompt

There are two supported paths:

1. File-based prompt (default):
   - Edit `apps/agent-worker/prompt.md`
   - Ensure `.env` includes `AGENT_SYSTEM_PROMPT_FILE=./prompt.md`

2. Inline env override:
   - Set `AGENT_SYSTEM_PROMPT="..."`
   - This overrides file loading in runtime.

Prompt loading logic is implemented in `loadSystemPrompt()` in `apps/agent-worker/src/agent.ts`.

## 2) Current tool integration pattern

All tools are declared in `DbAgent` with:

- `description`
- `parameters` (Zod schema)
- `execute` (async function)

Execution helpers:

- `dbGet(path)` and `dbPost(path, body)` call `DB_API_BASE_URL`.

## 2.1) Prefer SDK for external consumers

For app/backend teams integrating from outside this repo, prefer:

- JS SDK: `packages/va-platform-sdk`
- Contracts: `openapi/token-server.yaml`, `openapi/tool-backend.yaml`

## 3) Add a new tool to an external source

### Step A: add tool in agent

```ts
external_lookup: llm.tool({
  description: 'Lookup data in external CRM service',
  parameters: z.object({
    customerId: z.string().min(1),
  }),
  execute: async ({ customerId }) =>
    dbPost('/external/crm/lookup', { customerId: String(customerId) }),
}),
```

### Step B: implement backend endpoint

Add endpoint in your backend service (or replace `db-mock` / `tools-api-starter` implementation):

```ts
app.post('/external/crm/lookup', async (req, res) => {
  const { customerId } = req.body || {};
  if (!customerId) return res.status(400).json({ ok: false, error: 'customerId is required' });

  // call real external API here
  return res.json({ ok: true, customerId, status: 'active' });
});
```

### Step C: keep schemas strict

- Validate required values in Zod and server-side.
- Return machine-friendly JSON (`ok`, `error`, data fields).
- Keep natural language formatting in the model response, not in tool output.

## 4) Webhook/endpoint integration model

Use this pattern when tool action should trigger an external system asynchronously (CRM, ticketing, SMS, etc.):

1. Tool calls your backend endpoint.
2. Backend validates payload and stores an event record.
3. Backend triggers outbound webhook/job queue to external service.
4. Backend returns immediate ack to tool.

Minimal response contract recommendation:

```json
{
  "ok": true,
  "id": "evt_123",
  "status": "queued"
}
```

## 5) Retell-style behavior notes in this build

- `press_digit_get` is intentionally removed.
- `press_digit_medrics` remains active.
- Calendar tools are active:
  - `check_availability_cal`
  - `book_appointment_cal`

Prompt text was aligned so removed tools are not referenced as active capabilities.

## 6) Safety and quality checklist for new tools

- Do not pass placeholder strings like `{{customer_email}}` as literal values.
- Do not request sensitive data unless flow explicitly requires it.
- Use idempotent server behavior where possible.
- Add logs for each tool call outcome.
- Keep backend timeouts and retry strategy explicit.

## 7) Reference docs

- LiveKit tool/external data docs: [Tool Definition and Usage](https://docs.livekit.io/agents/build/external-data/)
- LiveKit voice agent startup docs: [Voice AI Quickstart](https://docs.livekit.io/agents/start/voice-ai/)
