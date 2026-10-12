#!/usr/bin/env bash
# Vercel Ignored Build Step: exit 0 = skip build, exit 1 = run build.
# Build only production (main) and branches tied to an open, non-draft pull request.

set -euo pipefail

ref="${VERCEL_GIT_COMMIT_REF:-}"
if [ -z "$ref" ]; then
  exit 1
fi

if [ "$ref" = "main" ]; then
  exit 1
fi

pr_id="${VERCEL_GIT_PULL_REQUEST_ID:-}"
if [ -z "$pr_id" ]; then
  exit 0
fi

token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
owner="${VERCEL_GIT_REPO_OWNER:-}"
repo="${VERCEL_GIT_REPO_SLUG:-}"

if [ -n "$token" ] && [ -n "$owner" ] && [ -n "$repo" ]; then
  draft="$(
    curl -sf \
      -H "Authorization: Bearer ${token}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${owner}/${repo}/pulls/${pr_id}" \
      | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).draft?'yes':'no')}catch{process.stdout.write('yes')}})"
  )"
  if [ "$draft" = "yes" ]; then
    exit 0
  fi
  exit 1
fi

# PR id present but no token to verify draft — build (prefer shipping ready PR previews).
exit 1
