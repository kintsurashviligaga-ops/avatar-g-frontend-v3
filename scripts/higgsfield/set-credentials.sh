#!/usr/bin/env bash
# Enter the Higgsfield API credential LOCALLY.
#
#   npm run hf:credentials
#
# The secret is typed with hidden input and goes only into .env.local (gitignored, chmod 600) and — only if you
# answer "y" — into this project's encrypted Vercel environment (Production + Preview). It is never echoed,
# logged, committed or sent anywhere else; nobody needs to see it in a chat.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env.local"

if ! git check-ignore -q .env.local; then
  echo "Refusing: .env.local is not ignored by git in $ROOT." >&2
  exit 1
fi

existing_id="$(grep -E '^HF_API_KEY_ID=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"

echo "Higgsfield API credential — from https://console.higgsfield.ai → API Keys."
if [ -n "$existing_id" ]; then
  printf 'API Key ID [Enter keeps %s…]: ' "${existing_id:0:8}"
else
  printf 'API Key ID: '
fi
read -r key_id
key_id="${key_id:-$existing_id}"

printf 'API Key SECRET (input is hidden): '
read -rs key_secret
echo

if [ -z "$key_id" ] || [ -z "$key_secret" ]; then
  echo "Both the key ID and the key secret are required." >&2
  exit 1
fi
case "$key_id$key_secret" in
  *:*|*' '*) echo "Unexpected ':' or space — paste each value exactly as the console shows it." >&2; exit 1 ;;
esac
if [ "$key_secret" = "$key_id" ]; then
  echo "The secret is the same as the key ID — the console shows two different values." >&2
  exit 1
fi

# Rewrite .env.local without any previous Higgsfield credential lines, then append the new ones.
tmp="$(mktemp)"
grep -vE '^(HF_CREDENTIALS|HF_API_KEY_ID|HF_API_KEY_SECRET)=' "$ENV_FILE" 2>/dev/null > "$tmp" || true
{
  cat "$tmp"
  printf 'HF_API_KEY_ID=%s\n' "$key_id"
  printf 'HF_CREDENTIALS=%s:%s\n' "$key_id" "$key_secret"
} > "$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"
echo "Saved to .env.local (value not shown; secret length ${#key_secret} characters)."

if command -v vercel >/dev/null 2>&1 && [ -f .vercel/project.json ]; then
  printf 'Also store it in Vercel, encrypted (Production + Preview)? [y/N] '
  read -r answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    printf '%s' "$key_id:$key_secret" | vercel env add HF_CREDENTIALS production --yes --force >/dev/null 2>&1 \
      && echo "Vercel Production: HF_CREDENTIALS set." || echo "Vercel Production: could not set (run 'vercel env ls')." >&2
    # All Preview branches need the explicit empty branch argument; the CLI takes this value only as a flag.
    vercel env add HF_CREDENTIALS preview "" --value "$key_id:$key_secret" --yes --force --non-interactive >/dev/null 2>&1 \
      && echo "Vercel Preview: HF_CREDENTIALS set." || echo "Vercel Preview: could not set (run 'vercel env ls')." >&2
  fi
fi

unset key_secret
echo "Done. Next: npm run hf:smoke (price check only, free) — then tell Claude it is set."
