#!/usr/bin/env bash
# Save the Higgsfield API key locally — checked live with Higgsfield (a FREE estimate call) before anything is
# written, and never shown, logged or committed.
#
#   npm run hf:credentials                       # paste "KEY_ID:KEY_SECRET" (or only the secret) at a hidden prompt
#   npm run hf:credentials -- --new-id           # asks for a new key's ID first, then its secret
#   npm run hf:credentials -- --from-file [path] # read the key from a file you saved (default: ~/Desktop/hf-key.*)
#   npm run hf:credentials -- --from-clipboard   # read the key the console's Copy button put on the clipboard
#   add --vercel                                 # also store it in Vercel without asking
#
# --from-file exists because pasting into a hidden terminal prompt failed for us (nothing echoes, so it is
# impossible to tell whether a paste landed). Pasting into TextEdit is visible; save it as "hf-key" on the
# Desktop — plain text or TextEdit's default rich text both work — and the file is deleted once the key is
# saved (or is rejected; it is kept only when Higgsfield could not be reached, so a correct key is not lost).
#
# Destinations: .env.local (gitignored, chmod 600) and — on "y" or --vercel — this project's encrypted Vercel
# environment (Production + Preview).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1
ENV_FILE="$ROOT/.env.local"
BASE="${HF_API_BASE_URL:-https://api.higgsfield.ai}"
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

MODE=prompt NEW_ID=0 PUSH_VERCEL=ask SRC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --new-id) NEW_ID=1 ;;
    --vercel) PUSH_VERCEL=yes ;;
    --from-clipboard) MODE=clipboard ;;
    --from-file)
      MODE=file
      if [ -n "${2:-}" ] && [[ "$2" != --* ]]; then SRC="$2"; shift; fi ;;
  esac
  shift
done

if ! git check-ignore -q .env.local; then
  echo "Refusing: .env.local is not ignored by git in $ROOT." >&2
  exit 1
fi

key_id="$(grep -E '^HF_API_KEY_ID=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
key_secret=""

# A FREE estimate call. The Authorization header goes through a pipe (-H @file), never the process list.
# curl prints 000 itself when it cannot connect — nothing is appended, so the code is always three digits.
verify() {
  local code
  code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST \
    -H @<(printf 'Authorization: Key %s:%s\n' "$1" "$2") \
    -H 'Content-Type: application/json' \
    --data '{"prompt":"credential check","duration":4,"resolution":"480p","generate_audio":false}' \
    "$BASE/estimate/bytedance/seedance-2.5/text-to-video" 2>/dev/null)"
  [[ "$code" =~ ^[0-9]{3}$ ]] || code=000
  printf '%s' "$code"
}

# Accepts "KEY_ID:KEY_SECRET" (what the console copies) or a bare secret for the configured ID.
# Sets key_id / key_secret; prints a reason and returns 1 when the input cannot be a key.
parse_key() {
  local raw left right
  raw="$(printf '%s' "$1" | tr -d '[:space:]')"
  if [ -z "$raw" ]; then echo "The key is empty."; return 1; fi
  if [[ "$raw" == *:* ]]; then
    left="${raw%%:*}"; right="${raw#*:}"
    if [[ "$left" =~ $UUID_RE ]] && [ -n "$right" ] && [[ "$right" != *:* ]]; then
      key_id="$left"; key_secret="$right"; return 0
    fi
    echo "That has a ':' but is not KEY_ID:KEY_SECRET — use the whole key exactly as the console shows it."; return 1
  fi
  if ! [[ "$key_id" =~ $UUID_RE ]]; then echo "Only a secret was given and no key ID is configured — use the whole KEY_ID:KEY_SECRET."; return 1; fi
  if [ "$raw" = "$key_id" ]; then echo "That is the key ID, not the secret."; return 1; fi
  key_secret="$raw"; return 0
}

# → 0 accepted, 1 rejected, 2 unreachable
check() {
  local code
  code="$(verify "$key_id" "$key_secret")"
  # Only an answer that proves the key was AUTHENTICATED saves it: 200, 403 (no credits), 400/422 (the probe
  # body was judged — auth had already passed). 401 is a wrong key; anything else (000, 5xx, 429…) proves
  # nothing about the key, so nothing is saved and a key file is kept.
  case "$code" in
    200) echo "OK — Higgsfield accepted the key (ID ${key_id:0:8}…)."; return 0 ;;
    403) echo "OK — Higgsfield accepted the key (ID ${key_id:0:8}…), but the account has NO credits (403)."; return 0 ;;
    400|422) echo "OK — Higgsfield authenticated the key (ID ${key_id:0:8}…; the test request itself answered $code)."; return 0 ;;
    401) echo "Higgsfield rejected this key (401) — it is not a valid KEY_ID:KEY_SECRET pair."; return 1 ;;
    000) echo "Could not reach Higgsfield (network). Nothing saved."; return 2 ;;
    *)   echo "Higgsfield answered HTTP $code, which does not confirm the key. Nothing saved — try again shortly."; return 2 ;;
  esac
}

ok=0
if [ "$MODE" = clipboard ]; then
  # The copy worked where pasting into a terminal did not. Read it, check it, and clear the clipboard once it is
  # saved or rejected (kept only when Higgsfield could not be reached, so a correct key is not lost).
  raw="$(${HF_CLIPBOARD_CMD:-pbpaste} 2>/dev/null)"
  if parse_key "$raw"; then
    check; rc=$?
    if [ $rc -eq 0 ]; then ok=1; fi
    if [ $rc -ne 2 ]; then printf '' | ${HF_CLIPBOARD_CLEAR_CMD:-pbcopy} && echo "Clipboard cleared."; fi
  fi
  unset raw
elif [ "$MODE" = file ]; then
  if [ -z "$SRC" ]; then
    for c in "$HOME/Desktop/hf-key.txt" "$HOME/Desktop/hf-key.rtf" "$HOME/Desktop/hf-key.rtfd" "$HOME/Desktop/hf-key"; do
      if [ -e "$c" ]; then SRC="$c"; break; fi
    done
  fi
  if [ -z "$SRC" ] || [ ! -e "$SRC" ]; then echo "No key file found (looked for ~/Desktop/hf-key.txt / .rtf)." >&2; exit 1; fi
  case "$SRC" in
    *.rtf|*.rtfd) raw="$(textutil -convert txt -stdout "$SRC" 2>/dev/null)" ;;
    *) raw="$(cat "$SRC")" ;;
  esac
  if parse_key "$raw"; then
    check; rc=$?
    if [ $rc -eq 0 ]; then ok=1; fi
    if [ $rc -ne 2 ]; then rm -rf "$SRC" && echo "Key file deleted."; fi
  else
    rm -rf "$SRC" && echo "Key file deleted (it did not contain a usable key)."
  fi
  unset raw
else
  if [ "$NEW_ID" = 1 ] || ! [[ "$key_id" =~ $UUID_RE ]]; then
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
  for attempt in 1 2 3; do
    printf 'Paste the API key (KEY_ID:KEY_SECRET) or just the secret, then Enter (nothing shows): '
    read -rs entered
    echo
    parse_key "$entered" || continue
    if check; then ok=1; break; fi
  done
  unset entered
fi

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
  answer="n"
  if [ "$PUSH_VERCEL" = yes ]; then
    answer="y"
  elif [ "$MODE" = prompt ]; then
    printf 'Also store it in Vercel, encrypted (Production + Preview)? Type y and press Enter: '
    read -r answer
  fi
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    printf '%s' "$key_id:$key_secret" | vercel env add HF_CREDENTIALS production --yes --force >/dev/null 2>&1 \
      && echo "Vercel Production: saved." || echo "Vercel Production: could not save (vercel env ls)." >&2
    vercel env add HF_CREDENTIALS preview "" --value "$key_id:$key_secret" --yes --force --non-interactive >/dev/null 2>&1 \
      && echo "Vercel Preview: saved." || echo "Vercel Preview: could not save (vercel env ls)." >&2
  fi
fi

unset key_secret
echo "Done — tell Claude it is set."
