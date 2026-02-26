# React Native Integration Guide

## Target

Integrate a React Native app with the VA voice platform using:

- LiveKit React Native SDK for realtime media
- `@va-platform/voice-sdk` for token and backend API calls

## Dependencies

```bash
npm install @livekit/react-native @livekit/react-native-webrtc livekit-client
npm install @va-platform/voice-sdk
```

If consuming from this monorepo workspace:

```bash
pnpm add @va-platform/voice-sdk --filter <your-rn-app>
```

## Environment

Set these in your RN app config:

- `TOKEN_SERVER_BASE_URL` (example: `https://token.example.com`)
- `LIVEKIT_WS_URL` (example: `wss://livekit.example.com`)

## Token fetch helper

```ts
import { TokenApiClient } from '@va-platform/voice-sdk';

const tokenApi = new TokenApiClient({
  baseUrl: process.env.TOKEN_SERVER_BASE_URL!,
});

export async function getVoiceToken(identity: string, room = 'va_voice_room') {
  return tokenApi.getToken({ room, identity });
}
```

## LiveKit room connect (RN)

```tsx
import React, { useEffect, useState } from 'react';
import { LiveKitRoom } from '@livekit/react-native';
import { registerGlobals } from '@livekit/react-native-webrtc';
import { getVoiceToken } from './token';

registerGlobals();

export function VoiceRoomScreen() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await getVoiceToken('mobile_user_123', 'test_room');
      setToken(result.token);
    })();
  }, []);

  if (!token) return null;

  return (
    <LiveKitRoom
      serverUrl={process.env.LIVEKIT_WS_URL!}
      token={token}
      connect={true}
      audio={true}
      video={false}
    >
      {/* render your audio UI */}
    </LiveKitRoom>
  );
}
```

## Optional: tools API usage from app

Only do this if your product flow requires direct app-to-backend calls.
For sensitive actions, route through your own BFF/API.

```ts
import { ToolsApiClient } from '@va-platform/voice-sdk';

const tools = new ToolsApiClient({ baseUrl: process.env.TOOLS_API_BASE_URL! });
const slots = await tools.checkAvailability({ preferredTimeOfDay: 'afternoon' });
```

## Mobile release checklist

- Validate token retrieval over HTTPS.
- Validate microphone permission flow.
- Test reconnect after network switch.
- Confirm room cleanup on app background/terminate.
