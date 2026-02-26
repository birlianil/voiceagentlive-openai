import crypto from 'node:crypto';

export function parseCorsOrigin(value: string): true | string[] {
  const normalized = value.trim();
  if (!normalized || normalized === '*') return true;
  return normalized
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function timingSafeTokenEquals(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getBearerToken(headerValue: string | undefined): string {
  const raw = (headerValue || '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
}

export function createRequestId(): string {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}
