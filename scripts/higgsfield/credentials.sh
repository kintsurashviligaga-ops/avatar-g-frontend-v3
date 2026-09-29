#!/usr/bin/env bash
# Enter the Higgsfield API key SECRET locally — hidden, checked live with Higgsfield (a FREE estimate call),
# and only then saved.
#
#   npm run hf:credentials              # paste the secret — or the whole "KEY_ID:KEY_SECRET" the console copies
#   npm run hf:credentials -- --new-id  # you created a NEW key and have only its separate ID + secret
#
# The secret is never shown, logged or committed. It goes into .env.local (gitignored, chmod 600) and — only if
# you answer "y" — into this project's encrypted Vercel environment (Production + Preview).
#
# Why the live check: the first version saved whatever was typed. A secret pasted into the ID prompt, or a
# stray "y" glued to the ID, was saved as a credential that could never work. Now nothing is saved until
# Higgsfield itself has accepted the pair.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1
ENV_FILE="$ROOT/.env.local"
BASE="${HF_API_BASE_URL:-https://api.higgsfield.ai}"
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

if ! git check-ignore -q .env.local; then
  echo "Refusing: .env.local is not ignored by git in $ROOT." >&2
  exit 1
fi

key_id="$(grep -E '^HF_API_KEY_ID=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"

if [ "${1:-}" = "--new-id" ] || ! [[ "$key_id" =~ $UUID_RE ]]; then
  key_id=""
  for attempt in 1 2 3; do
    printf 'Paste the API Key ID (looks like 1234abcd-12ab-…) and press Enter: '
    read -r candidate
    candidate="$(printf '%s' "$candidate" | tr -d '[:space:]')"
    if [[ "$candidate" =~ $UUID_RE ]]; then key_id="$candidate"; break; fi
    echo "That is not a key ID (it has the shape 8-4-4-4-12 characters). Try again."
  done
  [ -n "$key_id" ] || exit 1
fi
echo "Key ID: ${key_id:0:8}…"

# A FREE estimate call. The Authorization header goes through a pipe (-H @file), never the process list.
verify() {
  curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST \
    -H @<(printf 'Authorization: Key %s:%s\n' "$1" "$2") \
    -H 'Content-Type: application/json' \
    --data '{"prompt":"credential check","duration":4,"resolution":"480p","generate_audio":false}' \
    "$BASE/estimate/bytedance/seedance-2.5/text-to-video" 2>/dev/null || printf '000'
}

ok=0
key_secret=""
for attempt in 1 2 3; do
  printf 'Paste the API key (KEY_ID:KEY_SECRET) or just the secret, then Enter (nothing shows): '
  read -rs key_secret
  echo
  key_secret="$(printf '%s' "$key_secret" | tr -d '[:space:]')"
  if [ -z "$key_secret" ]; then echo "Nothing was pasted. Try again."; continue; fi
  # The console's "API key" copies as ONE string "KEY_ID:KEY_SECRET" — accept it whole and take the ID from it.
  if [[ "$key_secret" == *:* ]]; then
    left="${key_secret%%:*}"; right="${key_secret#*:}"
    if [[ "$left" =~ $UUID_RE ]] && [ -n "$right" ] && [[ "$right" != *:* ]]; then
      key_id="$left"; key_secret="$right"
      echo "Read a combined key — ID ${key_id:0:8}…"
    else
      echo "That has a ':' but is not KEY_ID:KEY_SECRET — paste the whole key exactly as copied, or only the secret."; continue
    fi
  fi
  if [ "$key_secret" = "$key_id" ]; then echo "That is the key ID, not the secret — the console shows a second, different value."; continue; fi
  code="$(verify "$key_id" "$key_secret")"
  case "$code" in
    200) echo "OK — Higgsfield accepted the key."; ok=1; break ;;
    403) echo "OK — Higgsfield accepted the key, but the account has NO credits (403). Top up at console.higgsfield.ai."; ok=1; break ;;
    401) echo "Higgsfield rejected this secret for key ${key_id:0:8}… (401). Paste it again — or, if you created a NEW key, press Ctrl+C and run: npm run hf:credentials -- --new-id" ;;
    000) echo "Could not reach Higgsfield (network). Nothing saved — try again." ;;
    *)   echo "Higgsfield answered HTTP $code — saving it; the smoke test will show more."; ok=1; break ;;
  esac
done

if [ "$ok" != 1 ]; then
  unset key_secret
  echo "Nothing was saved." >&2
  exit 1
fi

tmp="$(mktemp)"
grep -vE '^(HF_CREDENTIALS|HF_API_KEY_ID|HF_API_KEY_SECRET)=' "$ENV_FILE" 2>/dev/null > "$tmp" || true
{
  cat "$tmp"
  printf 'HF_API_KEY_ID=%s\n' "$key_id"
  printf 'HF_CREDENTIALS=%s:%s\n' "$key_id" "$key_secret"
} > "$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"
echo "Saved to .env.local (value not shown)."

if command -v vercel >/dev/null 2>&1 && [ -f .vercel/project.json ]; then
  printf 'Also store it in Vercel, encrypted (Production + Preview)? Type y and press Enter: '
  read -r answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    printf '%s' "$key_id:$key_secret" | vercel env add HF_CREDENTIALS production --yes --force >/dev/null 2>&1 \
      && echo "Vercel Production: saved." || echo "Vercel Production: could not save (vercel env ls)." >&2
    vercel env add HF_CREDENTIALS preview "" --value "$key_id:$key_secret" --yes --force --non-interactive >/dev/null 2>&1 \
      && echo "Vercel Preview: saved." || echo "Vercel Preview: could not save (vercel env ls)." >&2
  fi
fi

unset key_secret
echo "Done — tell Claude it is set."
