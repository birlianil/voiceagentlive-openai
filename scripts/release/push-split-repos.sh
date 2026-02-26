#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/release/push-split-repos.sh
#
# Optional env:
#   OWNER=<github-owner>      # defaults from origin remote owner
#   CREATE_REPOS=true|false   # default true
#   VISIBILITY=public|private # default public

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAP_FILE="$ROOT_DIR/scripts/release/split-repos.map"
CREATE_REPOS="${CREATE_REPOS:-true}"
VISIBILITY="${VISIBILITY:-public}"

if [ ! -f "$MAP_FILE" ]; then
  echo "Missing map file: $MAP_FILE"
  exit 1
fi

ORIGIN_URL="$(git -C "$ROOT_DIR" remote get-url origin)"
DEFAULT_OWNER="$(printf "%s" "$ORIGIN_URL" | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#')"
OWNER="${OWNER:-$DEFAULT_OWNER}"

CRED_CONTENT=$(printf "protocol=https\nhost=github.com\n\n" | git -C "$ROOT_DIR" credential fill)
GH_USER=$(printf "%s\n" "$CRED_CONTENT" | awk -F= '$1=="username"{print $2}')
GH_PASS=$(printf "%s\n" "$CRED_CONTENT" | awk -F= '$1=="password"{print $2}')

if [ -z "${GH_USER:-}" ] || [ -z "${GH_PASS:-}" ]; then
  echo "Missing GitHub credentials in git credential helper"
  exit 1
fi

HTTP_USER=$(curl -sS -o /tmp/gh_user_check.json -w "%{http_code}" \
  -u "$GH_USER:$GH_PASS" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user)

if [ "$HTTP_USER" != "200" ]; then
  echo "GitHub API auth failed (HTTP $HTTP_USER)"
  cat /tmp/gh_user_check.json | head -c 400
  exit 1
fi

while read -r REPO BRANCH; do
  [[ -z "${REPO:-}" || "${REPO:0:1}" == "#" ]] && continue

  if ! git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "Missing local branch: $BRANCH"
    exit 1
  fi

  if [ "$CREATE_REPOS" = "true" ]; then
    HTTP_GET=$(curl -sS -o /tmp/gh_repo_get.json -w "%{http_code}" \
      -u "$GH_USER:$GH_PASS" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$OWNER/$REPO")

    if [ "$HTTP_GET" = "404" ]; then
      if [ "$VISIBILITY" = "private" ]; then
        PRIVATE_VALUE=true
      else
        PRIVATE_VALUE=false
      fi

      PAYLOAD=$(cat <<JSON
{
  "name": "$REPO",
  "private": $PRIVATE_VALUE,
  "description": "Split from voiceagentlive-openai ($BRANCH)",
  "has_issues": true,
  "has_wiki": false,
  "has_projects": false,
  "auto_init": false
}
JSON
)

      HTTP_CREATE=$(curl -sS -o /tmp/gh_repo_create.json -w "%{http_code}" \
        -u "$GH_USER:$GH_PASS" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -d "$PAYLOAD" \
        https://api.github.com/user/repos)

      if [ "$HTTP_CREATE" != "201" ] && [ "$HTTP_CREATE" != "422" ]; then
        echo "Repo create failed for $REPO (HTTP $HTTP_CREATE)"
        cat /tmp/gh_repo_create.json | head -c 400
        exit 1
      fi
    fi
  fi

  echo "Pushing $BRANCH -> $OWNER/$REPO:main"
  git -C "$ROOT_DIR" push "https://github.com/$OWNER/$REPO.git" "$BRANCH:main" --force

done < "$MAP_FILE"

echo "Split push completed for owner=$OWNER"
