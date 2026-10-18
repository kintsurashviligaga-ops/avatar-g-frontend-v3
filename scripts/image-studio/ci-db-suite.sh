#!/usr/bin/env bash
# Ephemeral loopback DB only; each suite must terminate naturally.
set -euo pipefail
case "${LEASE_PG_REST_URL:-}" in
  http://127.0.0.1:54330) ;;
  *) echo "BLOCKED: expected the isolated CI loopback endpoint" >&2; exit 2 ;;
esac
case "${1:-}" in
  lease-before|ledger-before|ledger-after|lease-after|runs|outbox|image|lease-baseline) ;;
  *) echo "Unknown evidence label" >&2; exit 2 ;;
esac
mkdir -p evidence
seconds=240
# The historical baseline has an already-proven permanent interval; retain its failure and bound the diagnostic.
if [ "$1" = lease-baseline ]; then seconds=60; fi
timeout --kill-after=10s "${seconds}s" node node_modules/jest/bin/jest.js "$2" \
  --runInBand --no-watchman --ci --detectOpenHandles --json --outputFile="evidence/$1.json" \
  2>&1 | tee "evidence/$1.log"
