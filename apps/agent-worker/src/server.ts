import 'dotenv/config';

import { cli, WorkerOptions } from '@livekit/agents';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverFile = fileURLToPath(import.meta.url);
const ext = path.extname(serverFile);
const agentFile = path.join(path.dirname(serverFile), ext === '.ts' ? 'agent.ts' : 'agent.js');

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_WARMUP = (process.env.OPENAI_WARMUP || 'false').toLowerCase() === 'true';
const OPENAI_WARMUP_TIMEOUT_MS = Number(process.env.OPENAI_WARMUP_TIMEOUT_MS || 15_000);

async function warmupOpenAI(): Promise<void> {
  if (!OPENAI_WARMUP) return;

  if (!OPENAI_API_KEY) {
    console.warn('[startup] OPENAI_API_KEY missing, warmup skipped');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_WARMUP_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        max_tokens: 8,
        temperature: 0,
      }),
    });

    if (!res.ok) {
      throw new Error(`status=${res.status}`);
    }

    await res.json();
    console.log(`[startup] OpenAI warmup ready in ${Date.now() - startedAt}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[startup] OpenAI warmup skipped: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  if (!OPENAI_API_KEY) {
    console.warn('[startup] OPENAI_API_KEY is not set. Agent will not answer until key is configured.');
  }

  await warmupOpenAI();

  cli.runApp(
    new WorkerOptions({
      agent: agentFile,
      agentName: process.env.AGENT_NAME || 'db-agent',
      initializeProcessTimeout: 120_000,
      numIdleProcesses: 1,
    }),
  );
}

void main();
