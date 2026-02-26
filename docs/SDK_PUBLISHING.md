# SDK Publishing Guide

## Package

- Name: `@va-platform/voice-sdk`
- Source: `packages/va-platform-sdk`

## Private registry options

1. GitHub Packages (`https://npm.pkg.github.com`)
2. Private npm-compatible registry (Verdaccio / Artifactory / Nexus)

## Local publish (manual)

1. Build SDK:

```bash
npx pnpm@10.15.0 --filter @va-platform/voice-sdk build
```

2. Pack and inspect:

```bash
cd packages/va-platform-sdk
npm pack
```

3. Publish to private registry:

```bash
npm publish --registry <YOUR_REGISTRY_URL> --access restricted
```

Required auth:

- Export `NODE_AUTH_TOKEN` (or `NPM_TOKEN`) before publish.

## CI publish (recommended)

Workflow file:

- `.github/workflows/sdk-publish.yml`

Requirements:

1. Set repository secret `NPM_TOKEN`.
2. Trigger workflow manually (`workflow_dispatch`).
3. Provide target registry URL input if not using default.

## Install for consumers

```bash
npm install @va-platform/voice-sdk --registry <YOUR_REGISTRY_URL>
```

## Versioning policy

- Patch: bug fix, no API break
- Minor: additive non-breaking API
- Major: breaking API/contract changes
