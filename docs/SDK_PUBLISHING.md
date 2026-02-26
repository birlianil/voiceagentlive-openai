# SDK Publishing Guide

## Package

- Name: `@va-platform/voice-sdk`
- Source: `packages/va-platform-sdk`

## Internal publishing options

1. GitHub Packages (npm registry)
2. Private npm registry (Verdaccio/Artifactory/Nexus)

## Publish steps

1. Update `version` in `packages/va-platform-sdk/package.json`.
2. Build package:

```bash
pnpm --filter @va-platform/voice-sdk build
```

3. Pack and inspect:

```bash
cd packages/va-platform-sdk
npm pack
```

4. Publish to your private registry:

```bash
npm publish --registry <YOUR_REGISTRY_URL>
```

## Consumer install

```bash
npm install @va-platform/voice-sdk
```

## Versioning policy

- Patch: fixes, no API change
- Minor: additive non-breaking API
- Major: breaking API or response contract changes
