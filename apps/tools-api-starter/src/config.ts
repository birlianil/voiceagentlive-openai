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
  kbEnabled: boolean;
  kbTopK: number;
  kbKeywordCandidates: number;
  kbChunkSize: number;
  kbChunkOverlap: number;
  kbKeywordWeight: number;
  kbSemanticWeight: number;
  kbEmbeddingModel: string;
  kbEmbeddingTimeoutMs: number;
  kbOpenAiApiKey: string;
  kbOpenAiBaseUrl: string;
}

function asNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.trim().toLowerCase() === 'true';
}

function asNumberInRange(
  value: string | undefined,
  fallback: number,
  minValue: number,
  maxValue: number,
): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minValue, Math.min(maxValue, parsed));
}

export function loadConfig(): StarterConfig {
  const keywordWeight = asNumberInRange(process.env.KB_KEYWORD_WEIGHT, 0.35, 0, 1);
  const semanticWeight = asNumberInRange(process.env.KB_SEMANTIC_WEIGHT, 0.65, 0, 1);
  const totalWeight = keywordWeight + semanticWeight;

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
    kbEnabled: asBool(process.env.KB_ENABLED, true),
    kbTopK: asNumberInRange(process.env.KB_TOP_K, 5, 1, 20),
    kbKeywordCandidates: asNumberInRange(process.env.KB_KEYWORD_CANDIDATES, 40, 5, 200),
    kbChunkSize: asNumberInRange(process.env.KB_CHUNK_SIZE, 900, 200, 3000),
    kbChunkOverlap: asNumberInRange(process.env.KB_CHUNK_OVERLAP, 120, 0, 500),
    kbKeywordWeight: totalWeight > 0 ? keywordWeight / totalWeight : 0.35,
    kbSemanticWeight: totalWeight > 0 ? semanticWeight / totalWeight : 0.65,
    kbEmbeddingModel: String(process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small').trim(),
    kbEmbeddingTimeoutMs: asNumberInRange(process.env.KB_EMBEDDING_TIMEOUT_MS, 12_000, 1_000, 60_000),
    kbOpenAiApiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    kbOpenAiBaseUrl: String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
      .trim()
      .replace(/\/$/, ''),
  };

  if (config.authRequired && !config.authToken) {
    throw new Error('TOOLS_API_REQUIRE_AUTH=true but TOOLS_API_AUTH_TOKEN is empty');
  }

  return config;
}
