export interface StarterConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  webhookUrl: string;
  webhookSecret: string;
  webhookTimeoutMs: number;
  webhookMaxAttempts: number;
  webhookBackoffMs: number;
  corsOrigin: string;
  authRequired: boolean;
  authToken: string;
}

function asNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.trim().toLowerCase() === 'true';
}

export function loadConfig(): StarterConfig {
  const config: StarterConfig = {
    port: asNumber(process.env.PORT || process.env.TOOLS_API_STARTER_PORT, 4011),
    databaseUrl:
      String(process.env.DATABASE_URL || '').trim() ||
      'postgres://postgres:postgres@127.0.0.1:5432/va_voice',
    redisUrl: String(process.env.REDIS_URL || '').trim() || 'redis://127.0.0.1:6379',
    webhookUrl: String(process.env.TOOLS_WEBHOOK_URL || '').trim(),
    webhookSecret: String(process.env.TOOLS_WEBHOOK_SECRET || '').trim(),
    webhookTimeoutMs: asNumber(process.env.TOOLS_WEBHOOK_TIMEOUT_MS, 4_000),
    webhookMaxAttempts: asNumber(process.env.TOOLS_WEBHOOK_MAX_ATTEMPTS, 5),
    webhookBackoffMs: asNumber(process.env.TOOLS_WEBHOOK_BACKOFF_MS, 1_000),
    corsOrigin: String(process.env.TOOLS_API_CORS_ORIGIN || '*').trim(),
    authRequired: asBool(process.env.TOOLS_API_REQUIRE_AUTH, false),
    authToken: String(process.env.TOOLS_API_AUTH_TOKEN || '').trim(),
  };

  if (config.authRequired && !config.authToken) {
    throw new Error('TOOLS_API_REQUIRE_AUTH=true but TOOLS_API_AUTH_TOKEN is empty');
  }

  return config;
}
