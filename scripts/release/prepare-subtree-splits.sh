#!/usr/bin/env bash
set -euo pipefail

# Creates local subtree branches for optional multi-repo publishing.
# Push commands are intentionally not executed automatically.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

pushd "$ROOT_DIR" >/dev/null

git subtree split --prefix=packages/va-platform-sdk -b split/sdk || true
git subtree split --prefix=apps/agent-worker -b split/agent-worker || true
git subtree split --prefix=apps/token-server -b split/token-server || true
git subtree split --prefix=apps/db-mock -b split/tools-api-mock || true

echo "Created/updated branches: split/sdk, split/agent-worker, split/token-server, split/tools-api-mock"
echo "Example push: git push git@github.com:<ORG>/va-voice-sdk-js.git split/sdk:main"

popd >/dev/null
