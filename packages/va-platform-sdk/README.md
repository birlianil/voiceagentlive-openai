# @va-platform/voice-sdk

Lightweight client SDK for integrating with the VA voice platform backend.

## What it provides

- `TokenApiClient` for `/token` and `/token/raw`
- `ToolsApiClient` for tool backend endpoints
- KB helpers (`kbIngest`, `kbSearch`) for tool-RAG
- `createVaVoicePlatformClients()` factory
- Typed responses and a shared `VaSdkHttpError`

## Install (workspace/local)

```bash
pnpm --filter @va-platform/voice-sdk build
```

## Usage

```ts
import { createVaVoicePlatformClients } from '@va-platform/voice-sdk';

const { tokenApi, toolsApi } = createVaVoicePlatformClients({
  tokenServerBaseUrl: 'http://127.0.0.1:3000',
  toolsApiBaseUrl: 'http://127.0.0.1:4010',
  tokenServerApiKey: process.env.TOKEN_SERVER_API_KEY,
  toolsApiBearerToken: process.env.TOOLS_API_BEARER,
});

const token = await tokenApi.getToken({ room: 'test_room', identity: 'mobile_user' });
const availability = await toolsApi.checkAvailability({ preferredTimeOfDay: 'morning' });
const kb = await toolsApi.kbSearch({ query: 'VA home loan eligibility' });
```

## Error handling

```ts
import { VaSdkHttpError } from '@va-platform/voice-sdk';

try {
  await tokenApi.getToken();
} catch (err) {
  if (err instanceof VaSdkHttpError) {
    console.error(err.status, err.body);
  }
}
```

## Auth options

- `tokenServerApiKey`: sends `x-api-key` on token requests
- `toolsApiBearerToken`: sends `Authorization: Bearer <token>` on tool requests
