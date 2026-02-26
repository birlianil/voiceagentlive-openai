import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';

const app = express();
app.use(cors());

const PORT = Number(process.env.TOKEN_SERVER_PORT || 3000);
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const AGENT_NAME = process.env.AGENT_NAME || 'db-agent';
const TOKEN_TTL = process.env.TOKEN_TTL || '24h';

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required');
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/token', async (req, res) => {
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

app.get('/token/raw', async (req, res) => {
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
});
