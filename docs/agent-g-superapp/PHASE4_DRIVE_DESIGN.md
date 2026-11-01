# Phase 4 — Google Drive connector (design)

Date: 2026-11-01 · Master Task v2.0 §6 · Truth matrix rows M2, M3, M4.

## Decision

GG chose on 2026-11-01 07:00Z: **"only picked files"**. Agent G reads only the Drive files that the user picks in
Google's own Picker. It never sees the rest of the Drive.

- OAuth scope: `https://www.googleapis.com/auth/drive.file`, plus `openid email` to show which account is linked.
- `drive.file` is a non-sensitive scope, so Google does not need to verify the app and no security assessment is
  needed. `drive.readonly` would be a restricted scope with a paid assessment, and it is not used.
- The provider is Google only, which fits the v2.0 policy.

## What the user sees

1. Deep Research → Connectors → **Google Drive** → „დაკავშირება“. Google's consent screen opens and the user returns
   to myavatar.ge.
2. „ფაილის არჩევა“ opens the Google Picker. The user picks one or more Docs, Sheets, Slides, PDFs, DOCX, TXT or MD
   files. Only these become visible to the app (that is how `drive.file` works).
3. The picked files appear in the connector list. A research run can attach them, and Agent G can read them in the
   chat with the read-only tools `drive_list_files` and `drive_read_file`.
4. „გათიშვა“ revokes the token at Google and deletes the stored copy.

## Flow

```
GET  /api/connectors/google_drive/connect   session → signed state + PKCE verifier (httpOnly cookie, 10 min) → 302 to Google
GET  /api/connectors/google_drive/callback  state + cookie checked → code exchanged (with verifier) → refresh token
                                            ENCRYPTED → connector_accounts row → 302 back to the page
GET  /api/connectors/google_drive/picker    fresh short-lived access token + public API key + app id, for the Picker only
POST /api/connectors/google_drive/disconnect revoke at Google, delete the row
```

GET /api/connectors already lists every provider. Drive changes from `soon` to `ready` when it is configured and
linked for this user, and to `connectable` when it is configured but not yet linked.

## Security

- **State:** HMAC-SHA256 over `(userId, nonce, expiry)`, using the same construction as `quoteToken`. The callback
  refuses any state that is not this user's, is expired, or does not match the cookie.
- **PKCE:** S256 challenge. The verifier lives only in the httpOnly, Secure, SameSite=Lax cookie.
- **Tokens:**
  - The refresh token is stored AES-256-GCM encrypted with `CONNECTOR_TOKEN_KEY` (32 bytes, base64; a server-only env
    var), with a random 12-byte IV and `userId` as associated data. A row copied to another user does not decrypt.
  - Access tokens are never stored. Each request gets a fresh one from the refresh token.
- **Table** `connector_accounts`:
  - Columns: `user_id`, `provider`, `enc_refresh_token`, `scope`, `account_email`, `created_at`, `updated_at`; primary
    key `(user_id, provider)`.
  - RLS is on with no policies, so only `service_role` can read or write it.
  - Its migration needs GG's OK.
- **Revocation:** disconnect calls `https://oauth2.googleapis.com/revoke`. If Google answers `invalid_grant` on
  refresh (the user removed access in their Google account), the row is deleted and the connector shows as not linked.
- **Reads:** text is capped at the same per-file limits as local files (`RESEARCH_FILE_MAX_CHARS`). Binary downloads
  are capped at 10 MB. Only the listed MIME types are read.
- **Fail closed:** if the client id, secret or token key is missing, the connector stays `soon`, exactly as today.
- **No open-ended MCP call.** v2.0 §6.1 forbids a generic `call_mcp_tool`. The gateway has exactly two read-only tools.
  Writing to Drive is out of scope.

## Reading files

| Drive type | How |
|---|---|
| Google Docs | `files.export` → `text/plain` |
| Google Sheets | `files.export` → `text/csv` (first sheet) |
| Google Slides | `files.export` → `text/plain` |
| PDF | `files.get?alt=media` → unpdf (same as `/api/utils/extract-text`) |
| DOCX | `files.get?alt=media` → mammoth |
| TXT, MD, CSV | `files.get?alt=media` as UTF-8 |

## Owner steps (each needs GG's OK)

1. **Google Cloud** (project gen-lang-client-0671348730, through GG's Mac):
   - OAuth consent screen: External, app name MyAvatar, the privacy policy link, scope `drive.file`.
   - OAuth client of type Web, with the redirect URI `https://myavatar.ge/api/connectors/google_drive/callback`.
   - Picker API enabled, and an API key restricted to the Picker API and myavatar.ge.
   - None of this costs anything.
2. **Migration** `20261101a_connector_accounts.sql`, run by GG in the SQL Editor.
3. **Vercel Production env:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `CONNECTOR_TOKEN_KEY`,
   `GOOGLE_PICKER_API_KEY`, `GOOGLE_CLOUD_PROJECT_NUMBER`, and `CONNECTORS_DRIVE=admin`. The flag can be `admin`,
   `all` or `off`, following the `access.ts` pattern.
4. **Privacy policy:** add one line to `lib/legal/content.ts` saying that a linked Drive shares only the picked files,
   and only to read them.

## Acceptance (DRIVE-01, on myavatar.ge, admin first)

1. Link Drive.
2. Pick one Google Doc.
3. Ask Agent G „რა წერია ამ დოკუმენტში?“. It answers from the doc.
4. Disconnect. The Google account page no longer lists MyAvatar, and a second read answers „not connected“.

## Out of scope for this PR

Gmail, Calendar, Sheets writes, other providers (P1), and MyAvatar as an MCP server (M1).
