import crypto from 'node:crypto';

export interface WebhookDispatcherConfig {
  url: string;
  secret: string;
  timeoutMs: number;
}

export interface OutboundWebhookEvent {
  eventType: string;
  eventId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export function hasWebhook(config: WebhookDispatcherConfig): boolean {
  return Boolean(config.url);
}

function createSignature(secret: string, timestamp: string, body: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${body}`);
  return `v1=${hmac.digest('hex')}`;
}

export async function dispatchWebhook(
  config: WebhookDispatcherConfig,
  event: OutboundWebhookEvent,
): Promise<void> {
  if (!hasWebhook(config)) return;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(event);
  const signature = config.secret ? createSignature(config.secret, timestamp, body) : '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'x-signature': signature } : {}),
        'x-timestamp': timestamp,
        'x-event-type': event.eventType,
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`webhook status=${res.status} body=${text}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
