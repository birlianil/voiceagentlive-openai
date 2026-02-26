import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../../.env') });
dotenv.config();

const app = express();

const PORT = Number(process.env.TOKEN_SERVER_PORT || 3000);
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const AGENT_NAME = process.env.AGENT_NAME || 'db-agent';
const TOKEN_TTL = process.env.TOKEN_TTL || '24h';
const TOKEN_SERVER_CORS_ORIGIN = String(process.env.TOKEN_SERVER_CORS_ORIGIN || '*').trim();
const TOKEN_SERVER_REQUIRE_API_KEY =
  (process.env.TOKEN_SERVER_REQUIRE_API_KEY || 'false').toLowerCase() === 'true';
const TOKEN_SERVER_API_KEYS = String(process.env.TOKEN_SERVER_API_KEYS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const TOKEN_SERVER_RATE_LIMIT_WINDOW_MS = Number(process.env.TOKEN_SERVER_RATE_LIMIT_WINDOW_MS || 60_000);
const TOKEN_SERVER_RATE_LIMIT_MAX = Number(process.env.TOKEN_SERVER_RATE_LIMIT_MAX || 120);

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
}

if (TOKEN_SERVER_REQUIRE_API_KEY && TOKEN_SERVER_API_KEYS.length === 0) {
  throw new Error('TOKEN_SERVER_REQUIRE_API_KEY=true but TOKEN_SERVER_API_KEYS is empty');
}

const corsOrigin =
  !TOKEN_SERVER_CORS_ORIGIN || TOKEN_SERVER_CORS_ORIGIN === '*'
    ? true
    : TOKEN_SERVER_CORS_ORIGIN.split(',').map((x) => x.trim());

app.use(helmet());
app.use(cors({ origin: corsOrigin }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = String(req.header('x-request-id') || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  res.setHeader('x-request-id', requestId);
  next();
});

const tokenLimiter = rateLimit({
  windowMs: TOKEN_SERVER_RATE_LIMIT_WINDOW_MS,
  max: TOKEN_SERVER_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate limit exceeded' });
  },
});

function requireApiKey(req: Request, res: Response, next: NextFunction): Response | void {
  if (!TOKEN_SERVER_REQUIRE_API_KEY) return next();

  const headerKey = String(req.header('x-api-key') || '').trim();
  if (!headerKey || !TOKEN_SERVER_API_KEYS.includes(headerKey)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  return next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/token', tokenLimiter, requireApiKey, async (req, res) => {
  try {
    const room = String(req.query.room || 'test_room');
    const identity = String(req.query.identity || `user_${Date.now()}`);
    const ttl = String(req.query.ttl || TOKEN_TTL);

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl,
      name: identity,
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomCreate: true,
    });

    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })],
    });

    res.json({
      token: await token.toJwt(),
      room,
      identity,
      ttl,
      agentName: AGENT_NAME,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/token/raw', tokenLimiter, requireApiKey, async (req, res) => {
  try {
    const room = String(req.query.room || 'test_room');
    const identity = String(req.query.identity || `user_${Date.now()}`);
    const ttl = String(req.query.ttl || TOKEN_TTL);

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl,
      name: identity,
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomCreate: true,
    });

    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })],
    });

    res.type('text/plain').send(await token.toJwt());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).type('text/plain').send(`error: ${message}`);
  }
});

app.listen(PORT, () => {
  console.log(`token-server http://127.0.0.1:${PORT}`);
  console.log(`[startup] apiKeyRequired=${TOKEN_SERVER_REQUIRE_API_KEY}`);
});
