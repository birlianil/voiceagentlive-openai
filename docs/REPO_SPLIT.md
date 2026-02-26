# Optional Repo Split Strategy

If you want separate GitHub repositories for different teams, use this plan.

Current concrete split (already created) is tracked in:

- `docs/SPLIT_REPOS_INDEX.md`

## Suggested target repos

1. `va-voice-runtime`
- `apps/agent-worker`
- `apps/token-server`
- `docker-compose.yml`
- core docs

2. `va-voice-tools-api`
- production replacement of `apps/tools-api-starter`
- OpenAPI contracts

3. `va-voice-sdk-js`
- `packages/va-platform-sdk`

4. `va-voice-mobile-examples`
- client integration guides and sample app code

## Split commands (from current monorepo)

Quick helper script:

```bash
bash scripts/release/prepare-subtree-splits.sh
```

Then push created `split/*` branches to target repositories.

Automated push/create script:

```bash
bash scripts/release/push-split-repos.sh
```

Mapping file:

- `scripts/release/split-repos.map`

### SDK repo

```bash
git subtree split --prefix=packages/va-platform-sdk -b split/sdk
git push git@github.com:<ORG>/va-voice-sdk-js.git split/sdk:main
```

### Runtime repo

```bash
git subtree split --prefix=apps/agent-worker -b split/agent
git push git@github.com:<ORG>/va-voice-runtime.git split/agent:main
```

### Token server repo

```bash
git subtree split --prefix=apps/token-server -b split/token
git push git@github.com:<ORG>/va-voice-token-server.git split/token:main
```

### Tools API starter repo

```bash
git subtree split --prefix=apps/tools-api-starter -b split/tools-starter
git push git@github.com:<ORG>/va-voice-tools-api.git split/tools-starter:main
```

## Keep contracts synchronized

- Treat `openapi/*.yaml` as source of truth.
- Version contracts with semantic tags.
- Regenerate SDK clients on contract changes.

## Release governance recommendation

- Runtime changes: reviewed by platform + backend owners.
- Contract changes: mandatory cross-team approval.
- SDK changes: publish changelog and migration notes.
