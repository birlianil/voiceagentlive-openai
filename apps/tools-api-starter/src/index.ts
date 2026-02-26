import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

import { loadConfig } from './config.js';
import { dispatchWebhook, type OutboundWebhookEvent } from './webhook.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const config = loadConfig();

const KB = [
  { id: 'policy_1', title: 'Clinic hours', text: 'Clinic is open Mon-Fri 09:00-17:00.' },
  {
    id: 'policy_2',
    title: 'Appointments',
    text: 'Appointments can be booked up to 30 days in advance.',
  },
];

const CONTACTS: Array<{ id: string; name: string; email: string; ts: number }> = [];
const APPOINTMENTS: Array<{
  id: string;
  name: string;
  email: string;
  datetimeISO: string;
  type?: string;
  facility?: string;
  reason?: string;
  ts: number;
}> = [];
const EVENTS: Array<{
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}> = [];

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

function recordEvent(type: string, payload: Record<string, unknown>): string {
  const id = newId('evt');
  EVENTS.push({ id, type, payload, ts: Date.now() });
  return id;
}

async function emitWebhook(type: string, id: string, payload: Record<string, unknown>): Promise<void> {
  if (!config.webhookUrl) return;

  const event: OutboundWebhookEvent = {
    eventType: type,
    eventId: id,
    createdAt: new Date().toISOString(),
    payload,
  };

  try {
    await dispatchWebhook(
      {
        url: config.webhookUrl,
        secret: config.webhookSecret,
        timeoutMs: config.webhookTimeoutMs,
      },
      event,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook:error] type=${type} id=${id} ${message}`);
  }
}

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

app.post('/contact', (req: Request, res: Response) => {
  try {
    const name = requireString(req.body?.name, 'name');
    const email = requireString(req.body?.email, 'email');
    const id = newId('contact');

    CONTACTS.push({ id, name, email, ts: Date.now() });
    res.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
});

app.post('/appointments', (req: Request, res: Response) => {
  try {
    const name = requireString(req.body?.name, 'name');
    const email = requireString(req.body?.email, 'email');
    const datetimeISO = requireString(req.body?.datetimeISO, 'datetimeISO');
    const reason = optionalString(req.body?.reason);

    if (!isValidIsoDate(datetimeISO)) {
      return res.status(400).json({ ok: false, error: 'datetimeISO must be a valid ISO datetime' });
    }

    const id = newId('appt');
    APPOINTMENTS.push({ id, name, email, datetimeISO, reason, ts: Date.now() });
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

app.post('/calendar/book', (req: Request, res: Response) => {
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

    APPOINTMENTS.push({
      id,
      name,
      email,
      datetimeISO,
      type: appointmentType,
      facility,
      reason,
      ts: Date.now(),
    });

    return res.json({ ok: true, id, datetimeISO, appointmentType, facility });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ ok: false, error: message });
  }
});

app.post('/retell/send_call_summary_email', (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordEvent('send_call_summary_email', payload);
  void emitWebhook('send_call_summary_email', id, payload);
  res.json({ ok: true, id, status: 'queued' });
});

app.post('/retell/transfer_call', (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordEvent('transfer_call', payload);
  void emitWebhook('transfer_call', id, payload);
  res.json({ ok: true, id, status: 'transferred' });
});

app.post('/retell/press_digit_medrics', (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordEvent('press_digit_medrics', payload);
  void emitWebhook('press_digit_medrics', id, payload);
  res.json({ ok: true, id, digit: '5' });
});

app.post('/retell/end_call', (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordEvent('end_call', payload);
  void emitWebhook('end_call', id, payload);
  res.json({ ok: true, id, ended: true });
});

app.get('/internal/events', (_req: Request, res: Response) => {
  res.json({ ok: true, count: EVENTS.length, events: EVENTS.slice(-100) });
});

app.listen(config.port, () => {
  console.log(`tools-api-starter http://127.0.0.1:${config.port}`);
  if (config.webhookUrl) {
    console.log(`[startup] webhook enabled -> ${config.webhookUrl}`);
  } else {
    console.log('[startup] webhook disabled (TOOLS_WEBHOOK_URL is empty)');
  }
});
