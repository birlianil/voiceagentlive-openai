# Split Repositories Index

Current split repositories under `birlianil`:

- SDK: [va-voice-sdk-js](https://github.com/birlianil/va-voice-sdk-js)
- Agent worker: [va-voice-agent-worker](https://github.com/birlianil/va-voice-agent-worker)
- Token server: [va-voice-token-server](https://github.com/birlianil/va-voice-token-server)
- Tools API starter: [va-voice-tools-api](https://github.com/birlianil/va-voice-tools-api)
- Developer docs: [va-voice-developer-docs](https://github.com/birlianil/va-voice-developer-docs)
- API contracts: [va-voice-api-contracts](https://github.com/birlianil/va-voice-api-contracts)

## Sync workflow

1. Update monorepo.
2. Refresh split branches:

```bash
bash scripts/release/prepare-subtree-splits.sh
git subtree split --prefix=docs -b split/docs
git subtree split --prefix=openapi -b split/contracts
```

3. Push split repos:

```bash
bash scripts/release/push-split-repos.sh
```

Default mapping is in:

- `scripts/release/split-repos.map`
