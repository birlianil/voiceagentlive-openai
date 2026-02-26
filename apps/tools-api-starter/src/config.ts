export interface StarterConfig {
  port: number;
  webhookUrl: string;
  webhookSecret: string;
  webhookTimeoutMs: number;
}

function asNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): StarterConfig {
  return {
    port: asNumber(process.env.PORT || process.env.TOOLS_API_STARTER_PORT, 4011),
    webhookUrl: String(process.env.TOOLS_WEBHOOK_URL || '').trim(),
    webhookSecret: String(process.env.TOOLS_WEBHOOK_SECRET || '').trim(),
    webhookTimeoutMs: asNumber(process.env.TOOLS_WEBHOOK_TIMEOUT_MS, 4_000),
  };
}
