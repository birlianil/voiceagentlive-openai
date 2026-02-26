import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { loadConfig } from './config.js';
import { StarterDb } from './db.js';
import { createOutboxQueue, type OutboxJobData, type OutboxQueueHandle } from './queue.js';
import { createRequestId, getBearerToken, parseCorsOrigin, timingSafeTokenEquals } from './security.js';
import { dispatchWebhook } from './webhook.js';

const KB = [
  { id: 'policy_1', title: 'Clinic hours', text: 'Clinic is open Mon-Fri 09:00-17:00.' },
  {
    id: 'policy_2',
    title: 'Appointments',
    text: 'Appointments can be booked up to 30 days in advance.',
  },
];

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

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function withAsync(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const db = new StarterDb(config.databaseUrl);
  await db.init();

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

  app.get('/search', (req: Request, res: Response) => {
    const q = asString(req.query.q).toLowerCase();
    const results = !q
      ? []
      : KB.filter((x) => (x.title + ' ' + x.text).toLowerCase().includes(q)).slice(0, 10);

    res.json({ query: q, results });
  });

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
