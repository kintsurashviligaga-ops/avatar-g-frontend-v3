# Agent G plugins (GG 2026-11-20)

Ten plugins, one honest state each. The state comes from `GET /api/agent/plugins` (`lib/agent/plugins/catalog.ts`),
and the Connectors sheet beside „+" shows it in ka/en/ru when `NEXT_PUBLIC_AGENT_PLUGINS=1`.

**Everything is off by default.** With every flag empty, Agent G's tool list, the Connectors sheet and every route
behave exactly as before; the new routes answer 404.

| # | Plugin | What runs it | State today |
|---|--------|--------------|-------------|
| 1 | Google Drive | `drive_list_files`, `drive_read_file`, Picker (#254/#255, #390) | In prod for admins (CONNECTORS_DRIVE=admin). Picker failure now says why + Try again (#390). |
| 2 | Web search & research | `web_search` (Vertex grounding, sources), `scrape_webpage` | In prod. |
| 3 | Code & data sandbox | `quote_code_run` + workspace tools | In prod for admins (AGENT_G_SANDBOX). |
| 4 | Documents & PDF | `analyze_media` (PDF, pictures, video), `drive_read_file` (DOCX/CSV/TXT/Docs), `workspace_read_file` | In prod, gated by the existing flags. |
| 5 | Image | `quote_image` + Image service | In prod. |
| 6 | Voice, audio & music | mic STT (Chirp 3), read-aloud TTS, Lyria music, `quote_audio_from_link` | In prod. |
| 7 | Video & avatar | montage / assembly / edit quotes, Veo/Omni video, Live avatar, Task API | In prod. Custom Live avatars wait on Google's allowlist. |
| 8 | Notion | `notion_search`, `notion_read_page`, `notion_prepare_page` + Save card | **New, off.** Needs a Notion public integration + migration 20261120a. |
| 9 | GitHub | `github_list_repos`, `github_list_issues`, `github_read_file`, `github_prepare_issue` | **New, off.** Needs a GitHub OAuth App + migration 20261120a. |
| 10 | Calendar & reminders | `calendar_prepare_event` (Google Calendar link + .ics, any IANA zone) | **New, off.** Works with no account. Google Calendar sync waits on verification; stored reminders wait on the database (migration 20261120b). |

## Safety rules the code keeps

- Read tools are `inspect`; anything that would write elsewhere is `prepare`. The model never writes to Notion,
  GitHub or a calendar. Notion: the user presses **Save** on the card (`POST /api/connectors/notion/pages`, their
  session). GitHub: a github.com new-issue link the user submits there. Calendar: the user saves in Google Calendar or
  imports the .ics.
- Tokens are sealed with `CONNECTOR_TOKEN_KEY` (AES-256-GCM, the user id as associated data) in `connector_accounts`.
  The database never sees a plain token. Disconnect revokes at the provider and deletes the row.
- OAuth `state` is HMAC-signed per connector (a Notion state never verifies at the GitHub callback), bound to a
  path-scoped httpOnly cookie, 10 minutes. GitHub also uses PKCE S256 (Notion's endpoint has none).
- GitHub scope defaults to `read:user` (public repos). `repo` (private) is GG's decision: GitHub grants it read+write.
- A plugin that is not ready says why: `off`, `needs_setup` (app missing / database paused / migration pending),
  `not_connected`, `partial`, `blocked_external`. There is no dead button.

## Turning one on (each step is GG's)

1. Database back, then run `supabase/migrations/20261120a_connector_accounts_providers.sql` (and `20261120b` for reminders) in the SQL Editor of zwksnayknzggdcenqqxy.
2. Notion: create a **public** integration at notion.so/my-integrations, redirect `https://myavatar.ge/api/connectors/notion/callback`; set `NOTION_OAUTH_CLIENT_ID` / `NOTION_OAUTH_CLIENT_SECRET`.
3. GitHub: create an **OAuth App** (Settings → Developer settings), callback `https://myavatar.ge/api/connectors/github/callback`; set `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`.
4. Set `CONNECTORS_NOTION=admin`, `CONNECTORS_GITHUB=admin`, `AGENT_PLUGINS=admin`, `NEXT_PUBLIC_AGENT_PLUGINS=1`, redeploy, test as an admin, then widen.

See `GOOGLE_CALENDAR_GMAIL.md` for the Google side.
