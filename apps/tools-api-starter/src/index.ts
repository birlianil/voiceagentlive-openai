import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { loadConfig } from './config.js';
import { StarterDb, type KbSearchCandidateRecord } from './db.js';
import { chunkKbText, cosineSimilarity, createOpenAiEmbeddings, hashKbContent, parseEmbedding, truncateForSnippet } from './kb.js';
import { createOutboxQueue, type OutboxJobData, type OutboxQueueHandle } from './queue.js';
import { createRequestId, getBearerToken, parseCorsOrigin, timingSafeTokenEquals } from './security.js';
import { dispatchWebhook } from './webhook.js';

const DEFAULT_KB = [
  { id: 'policy_1', title: 'Clinic hours', text: 'Clinic is open Mon-Fri 09:00-17:00.' },
  {
    id: 'policy_2',
    title: 'Appointments',
    text: 'Appointments can be booked up to 30 days in advance.',
  },
];

interface KbIngestRequestBody {
  documentId?: string;
  title?: string;
  source?: string;
  externalRef?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  embed?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
}

interface KbSearchRequestBody {
  query?: string;
  source?: string;
  topK?: number;
}

interface RankedKbResult {
  sectionId: string;
  documentId: string;
  title: string;
  source: string;
  content: string;
  documentMetadata: Record<string, unknown>;
  sectionMetadata: Record<string, unknown>;
  score: {
    fused: number;
    keyword: number;
    semantic: number;
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = asString(value);
  if (!parsed) {
    throw new Error(`${fieldName} is required`);
  }
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  const parsed = asString(value);
  return parsed || undefined;
}

function isValidIsoDate(value: string): boolean {
  const dt = new Date(value);
  return Number.isFinite(dt.getTime());
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function withAsync(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function rankKbCandidates(
  candidates: KbSearchCandidateRecord[],
  queryEmbedding: number[] | null,
  keywordWeight: number,
  semanticWeight: number,
): RankedKbResult[] {
  if (candidates.length === 0) return [];

  const maxKeywordRank = Math.max(0.0001, ...candidates.map((x) => x.keywordRank));

  return candidates
    .map((candidate) => {
      const keyword = Math.max(0, candidate.keywordRank / maxKeywordRank);
      let semantic = 0;

      if (queryEmbedding) {
        const sectionEmbedding = parseEmbedding(candidate.embedding);
        if (sectionEmbedding && sectionEmbedding.length === queryEmbedding.length) {
          semantic = Math.max(0, cosineSimilarity(queryEmbedding, sectionEmbedding));
        }
      }

      const fused = queryEmbedding
        ? keywordWeight * keyword + semanticWeight * semantic
        : keyword;

      return {
        sectionId: candidate.sectionId,
        documentId: candidate.documentId,
        title: candidate.title,
        source: candidate.source,
        content: candidate.content,
        documentMetadata: candidate.documentMetadata,
        sectionMetadata: candidate.sectionMetadata,
        score: {
          fused,
          keyword,
          semantic,
        },
      };
    })
    .sort((a, b) => b.score.fused - a.score.fused);
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const db = new StarterDb(config.databaseUrl);
  await db.init();

  async function ingestKnowledgeDocument(
    payload: KbIngestRequestBody,
  ): Promise<{ documentId: string; sectionCount: number; embeddedCount: number; contentHash: string }> {
    if (!config.kbEnabled) {
      throw new Error('knowledge base is disabled');
    }

    const rawContent = requireString(payload.content, 'content');
    const contentHash = hashKbContent(rawContent);
    const source = optionalString(payload.source) || 'manual';
    const documentId = optionalString(payload.documentId) || `doc_${contentHash.slice(0, 16)}`;
    const title =
      optionalString(payload.title) ||
      truncateForSnippet(rawContent, 96).replace(/\n/g, ' ') ||
      `Document ${documentId}`;
    const externalRef = optionalString(payload.externalRef);
    const metadata = asOptionalRecord(payload.metadata) || {};

    const chunkSize = Math.max(200, Math.floor(asNumber(payload.chunkSize, config.kbChunkSize)));
    const chunkOverlap = Math.max(0, Math.floor(asNumber(payload.chunkOverlap, config.kbChunkOverlap)));
    const sections = chunkKbText(rawContent, chunkSize, chunkOverlap);

    if (sections.length === 0) {
      throw new Error('content did not produce any chunks');
    }

    const embed = asBool(payload.embed, Boolean(config.kbOpenAiApiKey));
    if (embed && !config.kbOpenAiApiKey) {
      throw new Error('OPENAI_API_KEY is required when embed=true');
    }

    let embeddings: number[][] = [];
    if (embed) {
      embeddings = await createOpenAiEmbeddings(
        {
          apiKey: config.kbOpenAiApiKey,
          baseUrl: config.kbOpenAiBaseUrl,
          model: config.kbEmbeddingModel,
          timeoutMs: config.kbEmbeddingTimeoutMs,
        },
        sections.map((x) => x.content),
      );
    }

    await db.upsertKbDocument({
      id: documentId,
      title,
      source,
      externalRef,
      metadata,
      contentHash,
    });

    await db.replaceKbSections(
      documentId,
      sections.map((section, index) => ({
        id: `${documentId}_sec_${section.chunkIndex}`,
        chunkIndex: section.chunkIndex,
        content: section.content,
        metadata: section.metadata,
        embedding: embeddings[index] || null,
      })),
    );

    const embeddedCount = embed ? embeddings.length : 0;

    return {
      documentId,
      sectionCount: sections.length,
      embeddedCount,
      contentHash,
    };
  }

  async function searchKnowledgeBase(payload: KbSearchRequestBody): Promise<{
    query: string;
    topK: number;
    totalCandidates: number;
    results: Array<{
      sectionId: string;
      documentId: string;
      title: string;
      source: string;
      snippet: string;
      content: string;
      score: {
        fused: number;
        keyword: number;
        semantic: number;
      };
      citation: {
        documentId: string;
        sectionId: string;
        title: string;
        source: string;
      };
      metadata: {
        document: Record<string, unknown>;
        section: Record<string, unknown>;
      };
    }>;
  }> {
    if (!config.kbEnabled) {
      throw new Error('knowledge base is disabled');
    }

    const query = requireString(payload.query, 'query');
    const source = optionalString(payload.source);
    const topK = Math.max(1, Math.min(20, Math.floor(asNumber(payload.topK, config.kbTopK))));

    const candidates = await db.searchKbKeyword(query, config.kbKeywordCandidates, source);

    let queryEmbedding: number[] | null = null;
    const hasEmbeddings = candidates.some((x) => Array.isArray(x.embedding) && x.embedding.length > 0);

    if (hasEmbeddings && config.kbOpenAiApiKey) {
      try {
        const vectors = await createOpenAiEmbeddings(
          {
            apiKey: config.kbOpenAiApiKey,
            baseUrl: config.kbOpenAiBaseUrl,
            model: config.kbEmbeddingModel,
            timeoutMs: config.kbEmbeddingTimeoutMs,
          },
          [query],
        );
        queryEmbedding = vectors[0] || null;
      } catch (err) {
        console.warn(`[kb:search] embeddings disabled for query: ${asErrorMessage(err)}`);
      }
    }

    const ranked = rankKbCandidates(
      candidates,
      queryEmbedding,
      config.kbKeywordWeight,
      config.kbSemanticWeight,
    ).slice(0, topK);

    return {
      query,
      topK,
      totalCandidates: candidates.length,
      results: ranked.map((item) => ({
        sectionId: item.sectionId,
        documentId: item.documentId,
        title: item.title,
        source: item.source,
        snippet: truncateForSnippet(item.content, 360),
        content: item.content,
        score: item.score,
        citation: {
          documentId: item.documentId,
          sectionId: item.sectionId,
          title: item.title,
          source: item.source,
        },
        metadata: {
          document: item.documentMetadata,
          section: item.sectionMetadata,
        },
      })),
    };
  }

  if (config.kbEnabled) {
    const sectionCount = await db.countKbSections();
    if (sectionCount === 0) {
      for (const doc of DEFAULT_KB) {
        await ingestKnowledgeDocument({
          documentId: doc.id,
          title: doc.title,
          source: 'default',
          content: doc.text,
          metadata: { seed: true },
          embed: false,
        });
      }
      console.log('[kb:seed] inserted default knowledge documents');
    }
  }

  let outboxQueue: OutboxQueueHandle | null = null;

  const processOutboxJob = async (job: Job<OutboxJobData>): Promise<void> => {
    const outbox = await db.getOutbox(job.data.outboxId);
    if (!outbox) return;
    if (outbox.status === 'delivered') return;

    try {
      await dispatchWebhook(
        {
          url: outbox.destination,
          secret: config.webhookSecret,
          timeoutMs: config.webhookTimeoutMs,
        },
        {
          eventType: outbox.eventType,
          eventId: outbox.eventId,
          createdAt: new Date().toISOString(),
          payload: outbox.payload,
        },
      );

      await db.markOutboxDelivered(outbox.id);
      await db.setToolEventStatus(outbox.eventId, 'delivered');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempt = job.attemptsMade + 1;

      if (attempt >= config.webhookMaxAttempts) {
        await db.markOutboxDead(outbox.id, attempt, message);
        await db.setToolEventStatus(outbox.eventId, 'failed');
      } else {
        const delay = config.webhookBackoffMs * 2 ** Math.max(0, attempt - 1);
        await db.markOutboxRetry(outbox.id, attempt, message, new Date(Date.now() + delay));
        await db.setToolEventStatus(outbox.eventId, 'retrying');
      }

      throw err;
    }
  };

  if (config.webhookUrl) {
    outboxQueue = createOutboxQueue({
      redisUrl: config.redisUrl,
      processor: processOutboxJob,
    });
  }

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: parseCorsOrigin(config.corsOrigin) }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = asString(req.header('x-request-id')) || createRequestId();
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    if (!config.authRequired) return next();

    const provided = getBearerToken(req.header('authorization'));
    if (!provided) {
      return res.status(401).json({ ok: false, error: 'missing bearer token' });
    }

    if (!timingSafeTokenEquals(config.authToken, provided)) {
      return res.status(403).json({ ok: false, error: 'invalid token' });
    }

    return next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'tools-api-starter' });
  });

  app.get('/search', withAsync(async (req: Request, res: Response) => {
    const q = asString(req.query.q);
    if (!q) {
      res.json({ query: q, results: [] });
      return;
    }

    const result = await searchKnowledgeBase({ query: q, topK: 10 });
    res.json({
      query: result.query,
      results: result.results.map((x) => ({
        id: x.sectionId,
        title: x.title,
        text: x.snippet,
      })),
    });
  }));

  app.post('/kb/ingest', withAsync(async (req: Request, res: Response) => {
    try {
      const payload = (req.body || {}) as KbIngestRequestBody;
      const result = await ingestKnowledgeDocument(payload);
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: asErrorMessage(err) });
    }
  }));

  app.post('/kb/search', withAsync(async (req: Request, res: Response) => {
    try {
      const payload = (req.body || {}) as KbSearchRequestBody;
      const result = await searchKnowledgeBase(payload);
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: asErrorMessage(err) });
    }
  }));

  app.get('/kb/documents', withAsync(async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(200, Math.floor(asNumber(req.query.limit, 100))));
    const documents = await db.listKbDocuments(limit);
    res.json({
      ok: true,
      count: documents.length,
      documents,
    });
  }));

  app.post('/contact', async (req: Request, res: Response) => {
    try {
      const name = requireString(req.body?.name, 'name');
      const email = requireString(req.body?.email, 'email');
      const id = newId('contact');

      await db.saveContact(id, name, email);
      res.json({ ok: true, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post('/appointments', async (req: Request, res: Response) => {
    try {
      const name = requireString(req.body?.name, 'name');
      const email = requireString(req.body?.email, 'email');
      const datetimeISO = requireString(req.body?.datetimeISO, 'datetimeISO');
      const reason = optionalString(req.body?.reason);

      if (!isValidIsoDate(datetimeISO)) {
        return res.status(400).json({ ok: false, error: 'datetimeISO must be a valid ISO datetime' });
      }

      const id = newId('appt');
      await db.createAppointment({ id, name, email, datetimeISO, reason });
      return res.json({ ok: true, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ ok: false, error: message });
    }
  });

  app.post('/calendar/availability', (req: Request, res: Response) => {
    const dateFromISO = optionalString(req.body?.dateFromISO);
    const dateToISO = optionalString(req.body?.dateToISO);
    const preferredTimeOfDay = optionalString(req.body?.preferredTimeOfDay) || 'any';

    const from = dateFromISO && isValidIsoDate(dateFromISO) ? new Date(dateFromISO) : new Date();
    const to = dateToISO && isValidIsoDate(dateToISO)
      ? new Date(dateToISO)
      : new Date(from.getTime() + 2 * 86_400_000);

    const pref = preferredTimeOfDay.toLowerCase();
    const startHour = pref === 'afternoon' ? 13 : 9;
    const endHour = pref === 'morning' ? 12 : 17;

    const slots: Array<{ datetimeISO: string; available: boolean }> = [];

    for (let dayMs = from.getTime(); dayMs <= to.getTime() && slots.length < 12; dayMs += 86_400_000) {
      const day = new Date(dayMs);
      for (let hour = startHour; hour < endHour && slots.length < 12; hour += 1) {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);
        slots.push({ datetimeISO: slot.toISOString(), available: true });
      }
    }

    res.json({
      ok: true,
      query: {
        dateFromISO: from.toISOString(),
        dateToISO: to.toISOString(),
        preferredTimeOfDay: pref,
      },
      slots,
    });
  });

  app.post('/calendar/book', async (req: Request, res: Response) => {
    try {
      const datetimeISO = requireString(req.body?.datetimeISO, 'datetimeISO');
      if (!isValidIsoDate(datetimeISO)) {
        return res.status(400).json({ ok: false, error: 'datetimeISO must be a valid ISO datetime' });
      }

      const id = newId('appt');
      const appointmentType = optionalString(req.body?.appointmentType);
      const facility = optionalString(req.body?.facility);
      const reason = optionalString(req.body?.reason);
      const name = optionalString(req.body?.name) || 'unknown';
      const email = optionalString(req.body?.email) || 'unknown@example.com';

      await db.createAppointment({
        id,
        name,
        email,
        datetimeISO,
        appointmentType,
        facility,
        reason,
      });

      return res.json({ ok: true, id, datetimeISO, appointmentType, facility });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ ok: false, error: message });
    }
  });

  async function enqueueRetellEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; status: string }> {
    const eventId = newId('evt');

    if (!config.webhookUrl) {
      await db.createToolEvent(eventId, eventType, payload, 'accepted_no_webhook');
      return { id: eventId, status: 'accepted_no_webhook' };
    }

    await db.createToolEvent(eventId, eventType, payload, 'queued');

    const outboxId = newId('outbox');
    await db.createOutbox(outboxId, eventId, eventType, config.webhookUrl, payload);

    if (outboxQueue) {
      await outboxQueue.enqueue(outboxId, config.webhookMaxAttempts, config.webhookBackoffMs);
    }

    return { id: eventId, status: 'queued' };
  }

  app.post('/retell/send_call_summary_email', withAsync(async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    const event = await enqueueRetellEvent('send_call_summary_email', payload);
    res.json({ ok: true, id: event.id, status: event.status });
  }));

  app.post('/retell/transfer_call', withAsync(async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    const event = await enqueueRetellEvent('transfer_call', payload);
    res.json({ ok: true, id: event.id, status: 'transferred', queueStatus: event.status });
  }));

  app.post('/retell/press_digit_medrics', withAsync(async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    const event = await enqueueRetellEvent('press_digit_medrics', payload);
    res.json({ ok: true, id: event.id, digit: '5', queueStatus: event.status });
  }));

  app.post('/retell/end_call', withAsync(async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    const event = await enqueueRetellEvent('end_call', payload);
    res.json({ ok: true, id: event.id, ended: true, queueStatus: event.status });
  }));

  app.get('/internal/events', withAsync(async (req: Request, res: Response) => {
    const limitRaw = asString(req.query.limit);
    const limit = Number(limitRaw || 100);
    const events = await db.listRecentEvents(limit);
    res.json({ ok: true, count: events.length, events });
  }));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = asErrorMessage(err);
    console.error(`[request:error] ${req.method} ${req.path} ${message}`);
    if (res.headersSent) return;
    res.status(500).json({ ok: false, error: 'internal error' });
  });

  const server = app.listen(config.port, () => {
    console.log(`tools-api-starter http://127.0.0.1:${config.port}`);
    console.log(`[startup] db=${config.databaseUrl}`);
    console.log(`[startup] redis=${config.redisUrl}`);
    console.log(`[startup] authRequired=${config.authRequired}`);
    console.log(
      `[startup] kbEnabled=${config.kbEnabled} kbModel=${config.kbEmbeddingModel} weights=${config.kbKeywordWeight.toFixed(2)}/${config.kbSemanticWeight.toFixed(2)}`,
    );
    if (config.webhookUrl) {
      console.log(`[startup] webhook enabled -> ${config.webhookUrl}`);
    } else {
      console.log('[startup] webhook disabled (TOOLS_WEBHOOK_URL is empty)');
    }
  });

  const shutdown = async () => {
    server.close();
    if (outboxQueue) {
      await outboxQueue.close();
    }
    await db.close();
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

void bootstrap().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`[startup:error] ${message}`);
  process.exit(1);
});
