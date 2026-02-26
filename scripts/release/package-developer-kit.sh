#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist/developer-kit"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$ROOT_DIR/dist/va-voice-developer-kit-$STAMP.tar.gz"

mkdir -p "$ROOT_DIR/dist"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

copy_tree() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  rsync -a --exclude 'node_modules' "$src"/ "$dest"/
}

pushd "$ROOT_DIR" >/dev/null

pnpm build

cp -R docs "$OUT_DIR/docs"
cp -R openapi "$OUT_DIR/openapi"
cp README.md "$OUT_DIR/README.md"
cp .env.example "$OUT_DIR/.env.example"

mkdir -p "$OUT_DIR/sdk"
copy_tree "packages/va-platform-sdk" "$OUT_DIR/sdk/va-platform-sdk"

mkdir -p "$OUT_DIR/apps"
copy_tree "apps/agent-worker" "$OUT_DIR/apps/agent-worker"
copy_tree "apps/token-server" "$OUT_DIR/apps/token-server"
copy_tree "apps/db-mock" "$OUT_DIR/apps/db-mock"
copy_tree "apps/tools-api-starter" "$OUT_DIR/apps/tools-api-starter"

cat > "$OUT_DIR/CONTENTS.md" <<'CONTENTS'
# Developer Kit Contents

- docs/: architecture, integration, deployment, and runbooks
- openapi/: token server and tool backend OpenAPI contracts
- sdk/va-platform-sdk/: TS SDK package for token/tools APIs
- apps/: runtime services to deploy (agent-worker, token-server, db-mock, tools-api-starter)
- .env.example: baseline environment variables
CONTENTS

tar -czf "$ARCHIVE" -C "$ROOT_DIR/dist" "developer-kit"

echo "Developer kit created: $ARCHIVE"

popd >/dev/null
