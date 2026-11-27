# Launch env registry (generated)

_Generated from `lib/env/launchFlags.ts`. Do not edit by hand: run `WRITE_ENV_REGISTRY=1 npx jest lib/env/launchFlags.test.ts`._

Set each name **exactly** as written. The values a flag accepts differ between features. A value outside the
"Turns ON with" list leaves the feature OFF without any error. After a change in Vercel, open
`/api/admin/launch-flags` (admins only) to see how the code reads every switch.

Every change needs a redeploy: Vercel applies an environment change only to deployments made after it. `NEXT_PUBLIC_` names
are also baked into the browser bundle at build time.

## 3D Studio

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `STUDIO_3D_V2` | server | `admin` `everyone` | lib/studio3d/flag.ts (#366) | Pair: `NEXT_PUBLIC_STUDIO_3D_V2`. |
| `NEXT_PUBLIC_STUDIO_3D_V2` | client | `admin` `everyone` | components/studio3d/useStudio3dAvailable.ts (#369) | Pair: `STUDIO_3D_V2`. |
| `STUDIO_3D_JOB` | server | a value | lib/studio3d/server/deps.ts (#367) | Cloud Run job name of the GPU worker. |
| `STUDIO_3D_REGION` | server | a value | lib/studio3d/server/deps.ts (#367) | europe-west4 (where the GPU quota is). |
| `STUDIO_3D_GCP_PROJECT` | server | a value | lib/studio3d/server/deps.ts (#367) | Defaults to GCP_PROJECT_ID. |
| `STUDIO_3D_TIMEOUT_SEC` | server | a value | lib/studio3d/server/deps.ts (#367) | GPU task timeout; a stuck GPU never bills longer. |
| `STUDIO_3D_DAILY_CAP` | server | a value | lib/studio3d/server/deps.ts (#367) | Jobs per UTC day for the whole site; default 200. |

## Smart Editor

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `MONTAGE_SMART_EDITOR` | server | `admin` `everyone` | lib/services/montage/smart/flag.ts (#365) | Pair: `NEXT_PUBLIC_MONTAGE_SMART_EDITOR`. |
| `NEXT_PUBLIC_MONTAGE_SMART_EDITOR` | client | `admin` `everyone` | lib/services/montage/smart/flag.ts (#365) | Pair: `MONTAGE_SMART_EDITOR`. |

## Director's Workflow

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `DIRECTORS_WORKFLOW` | server | `admin` `everyone` | lib/video/directorsWorkflow/flag.ts (#349) |  |

## Art Director image

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `IMAGE_ART_DIRECTOR` | server | `admin` `everyone` | lib/image/artDirector/flag.ts (#356) | Pair: `NEXT_PUBLIC_IMAGE_ART_DIRECTOR`. |
| `NEXT_PUBLIC_IMAGE_ART_DIRECTOR` | client | `admin` `everyone` | lib/image/artDirector/chat.ts (#356) | Pair: `IMAGE_ART_DIRECTOR`. |

## Music Producer

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `MUSIC_PRODUCER_V2` | server | `admin` `everyone` | lib/music/producer/flag.ts (#359) | Pair: `NEXT_PUBLIC_MUSIC_PRODUCER_V2`. |
| `NEXT_PUBLIC_MUSIC_PRODUCER_V2` | client | `admin` `everyone` | lib/music/producer/flag.ts (#359) | Pair: `MUSIC_PRODUCER_V2`. |

## Virtual Studio avatar

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AVATAR_STUDIO_V2` | server | `admin` `everyone` | lib/avatar/studio/flag.ts (#362) | Pair: `NEXT_PUBLIC_AVATAR_STUDIO_V2`. |
| `NEXT_PUBLIC_AVATAR_STUDIO_V2` | client | `admin` `everyone` | lib/avatar/studio/flag.ts (#362) | Pair: `AVATAR_STUDIO_V2`. |

## Pricing v8

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_PRICING_V8` | client | `1` `true` `on` (exact) | lib/credits/priceBook.ts (#351) | Read by the server too (checkout, price book). Billing: turn on only by GG card after the v8 SQL. |

## Founder finance dashboard

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `ADMIN_FINANCE_DASHBOARD` | server | `1` `true` `on` (exact) | lib/billing/margin/flags.ts (#344) |  |

## Browser agent

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `BROWSER_ENABLED` | server | `1` (exact) | lib/agent/browser | Needs BROWSER_SNAPSHOT_ID too. |
| `BROWSER_SNAPSHOT_ID` | server | a value | lib/agent/browser | Vercel Sandbox snapshot; expires (remade 2026-11-12, expires 2026-12-12). |

## Browser agent / code run

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `SANDBOX_ENABLED` | server | `1` (exact) | lib/agent/sandbox |  |
| `AGENT_G_SANDBOX` | server | `admin` `1` `true` `on` | lib/agent/media/access.ts |  |

## Browser login

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_BROWSER_LOGIN` | server | `1` (exact) | lib/agent/browser (#346) | Also needs AGENT_BROWSER_VAULT_KEY. |
| `AGENT_BROWSER_VAULT_KEY` | server | a value (secret) | lib/agent/browser (#346) |  |

## Browser agent v2 / App Builder

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_BROWSER_AGENT` | server | `admin` `admins` | lib/agent/phase4/flags.ts (#312) | Admins only by design; there is no everyone value. |
| `AGENT_APP_BUILDER` | server | `admin` `admins` | lib/agent/phase4/flags.ts (#312) |  |
| `AGENT_SANDBOX_PACKAGES` | server | `admin` `admins` | lib/agent/phase4/flags.ts (#312) |  |

## Agent G engine

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_VALIDATE` | server | `1` `true` `on` | lib/agent/run/engineFlags.ts (#309) |  |
| `AGENT_ENGINE_MEDIA` | server | `admin` `admins` `everyone` `on` `1` `true` | lib/agent/run/engineFlags.ts (#310) |  |

## Reel task

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_REEL_TASK` | server | `admins` `everyone` | lib/agent/engine/reel.ts (#393) | admins WITH the s. admin is OFF here. |

## Agent G media

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_G_MEDIA_EXEC` | server | `admin` `1` `true` `on` | lib/agent/media/access.ts |  |
| `AGENT_G_FILE_ANALYSIS` | server | `admin` `1` `true` `on` | lib/agent/media/access.ts |  |

## Agent G plugins

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_PLUGINS` | server | `admin` `admins` `1` `true` `on` `all` | lib/agent/plugins/live.ts (#392) | Pair: `NEXT_PUBLIC_AGENT_PLUGINS`. |
| `NEXT_PUBLIC_AGENT_PLUGINS` | client | `1` (exact) | components/studio/PluginsList.tsx (#392) | Pair: `AGENT_PLUGINS`. |

## Google Drive

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CONNECTORS_DRIVE` | server | `admin` `1` `true` `on` `all` | lib/connectors/google/access.ts | Prod today: admin. |

## Notion

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CONNECTORS_NOTION` | server | `admin` `admins` `1` `true` `on` `all` | lib/connectors/oauth/access.ts (#392) | Needs NOTION_OAUTH_CLIENT_ID/SECRET, CONNECTOR_TOKEN_KEY and migration 20261120a. |
| `NOTION_OAUTH_CLIENT_ID` | server | a value | lib/connectors/notion (#392) |  |
| `NOTION_OAUTH_CLIENT_SECRET` | server | a value (secret) | lib/connectors/notion (#392) |  |

## GitHub

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CONNECTORS_GITHUB` | server | `admin` `admins` `1` `true` `on` `all` | lib/connectors/oauth/access.ts (#392) | Needs GITHUB_OAUTH_CLIENT_ID/SECRET, CONNECTOR_TOKEN_KEY and migration 20261120a. |
| `GITHUB_OAUTH_CLIENT_ID` | server | a value | lib/connectors/github (#392) |  |
| `GITHUB_OAUTH_CLIENT_SECRET` | server | a value (secret) | lib/connectors/github (#392) |  |

## Connectors

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CONNECTOR_TOKEN_KEY` | server | a value (secret) | lib/connectors |  |

## Live voice

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `LIVE_AUDIENCE` | server | `everyone` `admins` | lib/voice/liveAudience.ts | Anything but everyone = admins. Prod today: everyone. |

## Live avatar

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `LIVE_AVATAR_AUDIENCE` | server | `everyone` `admins` | lib/voice/liveAudience.ts | Anything but everyone = admins. Prod today: everyone. |

## Local JWT check

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AUTH_LOCAL_CLAIMS` | server | `1` `true` `on` `yes` | lib/supabase/localClaims.ts (#339) |  |

## Task relay ticket

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `TASK_RELAY_TICKET` | server | `1` `true` `on` `yes` | #340 |  |

## Chat media renew

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CHAT_MEDIA_RENEW` | server | `1` `true` `on` `yes` | #331 |  |

## Video advanced options

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CLIP_ADVANCED` | server | `1` `true` `on` `yes` | #320 | Pair: `NEXT_PUBLIC_CLIP_ADVANCED`. |
| `NEXT_PUBLIC_CLIP_ADVANCED` | client | `1` `true` `on` `yes` | #320 | Pair: `CLIP_ADVANCED`. |

## Video last frame

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `CLIP_LAST_FRAME` | server | `1` `true` `on` `yes` | #323 | Pair: `NEXT_PUBLIC_CLIP_LAST_FRAME`. |
| `NEXT_PUBLIC_CLIP_LAST_FRAME` | client | `1` `true` `on` `yes` | #323 | Pair: `CLIP_LAST_FRAME`. |

## Music UX v2

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_MUSIC_UX_V2` | client | `1` `true` `on` `yes` | #329 |  |

## Interior UX v2

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_INTERIOR_UX_V2` | client | `1` `true` `on` `yes` | #330 |  |

## Read-aloud voice v2

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `READ_ALOUD_VOICE_V2` | server | `1` `true` `on` `yes` | #322 |  |

## Safety identifier

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `SAFETY_IDENTIFIER` | server | `1` | #371 | Also needs SAFETY_IDENTIFIER_SALT. |

## Client error reports

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_CLIENT_ERROR_REPORTS` | client | `1` | lib/observability/clientErrorReports (#388) | #388 is NOT in the launch merge set yet. |

## Agent G injection shield

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_G_SHIELD` | server | `1` (exact) | app/api/agent/run/route.ts (#384) |  |

## Agent G memory deadline

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AGENT_G_CONTEXT_V2` | server | `1` (exact) | app/api/agent/run/route.ts (#385) |  |

## Live voice planner

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `LIVE_AGENT_PLANNER` | server | `1` (exact) | app/api/voice/live/route.ts (#386) |  |

## Agent G router v2

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_AGENT_G_ROUTER_V2` | client | `1` (exact) | components/studio/OmniStudio.tsx (#381) |  |

## Agent G credits / undo commands

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_AGENT_G_COMMANDS` | client | `1` (exact) | components/studio/OmniStudio.tsx (#382) |  |

## Chat goal pin

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_CHAT_PIN_GOAL` | client | `1` (exact) | app/api/chat/gemini/route.ts + OmniStudio (#385) | Read by the server route too; a change needs a redeploy. |

## Image extra ratios

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `IMAGE_EXTRA_RATIOS` | server | `1` `true` `on` `yes` | lib/studio/imageExtras.ts (#321) | Pair: `NEXT_PUBLIC_IMAGE_EXTRA_RATIOS`. |
| `NEXT_PUBLIC_IMAGE_EXTRA_RATIOS` | client | `1` `true` `on` `yes` | lib/studio/imageExtras.ts (#321) | Pair: `IMAGE_EXTRA_RATIOS`. |

## Image up to 14 references

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `IMAGE_MULTI_REF` | server | `1` `true` `on` `yes` | lib/studio/imageExtras.ts (#321) |  |

## Image edit mode

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_IMAGE_EDIT_MODE` | client | `1` `true` `on` `yes` | lib/studio/imageExtras.ts (#321) |  |

## AI provenance metadata (EU AI Act Art. 50)

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `AI_PROVENANCE_META` | server | `1` (exact) | lib/provenance/aiMarking.ts (#403) | Metadata only, invisible. GG 2026-11-27: may go on at launch. |

## Visible AI badge / deepfake label

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `NEXT_PUBLIC_AI_LABELS` | client | `1` (exact) | components/studio/ui/AiContentBadge.tsx (#404, #405) | GG 2026-11-27 08:09Z: stays OFF by default. |

## Ledger fail-closed

| Name | Side | Turns ON with | Where | Note |
|---|---|---|---|---|
| `LEDGER_FAIL_CLOSED` | server | `1` (exact) | lib/orchestrator/ledger.ts (#407) | Production only. Billing: GG card. |
