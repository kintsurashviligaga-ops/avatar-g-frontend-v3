# Service inventory — 2026-10-08 (Master Task §60 step 7)

Source of truth for this file: the repository at `main` 572d5fac (+ this branch), and the public production site read on
2026-10-08 through a scraper (the build sandbox cannot reach myavatar.ge directly). Every claim cites a file or a URL.
Statuses use the Master Task vocabulary: PROVEN / BUILT_NOT_PROVEN / PARTIAL / MISSING / BLOCKED_OWNER / FAILED / DEPRECATED.
Nothing below was executed against a paid provider; "runtime" means "the route that would run", not "proven to work".

## 0. Headline findings

1. **No service SSoT.** At least nine independent lists name the services; they disagree on ids, names, counts and prices (§1).
2. **The working product is the studio** (`/{lang}` for guests, `/{lang}/dashboard` signed-in, `FilmStudioHome` → `OmniStudio`),
   driven by `lib/studio/tools.ts` (17 tools) and priced by `lib/credits/quote.ts`. Everything else is marketing, legacy or dead.
3. **Two competing shells are live:** `/{lang}/hub` (`AiHubShell`, 19 nav items) and `/{lang}/workspace` (`WorkspaceDashboard`)
   alongside the studio. Their panels call `/api/ai`, which answers with Anthropic `claude-sonnet-4-6` text only, yet charges
   avatar 10 / image 5 / video 15 / music 8 / copy 3 credits (`app/api/ai/route.ts:49-64`). "Image Creator" on /hub never makes an image.
4. **Fake trust signals are live in production.** `/ka/hub` (scraped 2026-10-08) shows "12 Avatars Created", "7 Pipelines Run",
   "98% Success Rate", and "Brand Video Pipeline — 2 min ago — Done": hard-coded in `components/hub/panels/DashboardPanel.tsx:11-30`;
   the same numbers in `components/workspace/WorkspaceDashboard.tsx:57-66`. Master Task §27/§55: launch blocker.
5. **Counts shown to users contradict each other:** /services "24 modules" (`app/[locale]/services/page.tsx`, its list has 26),
   /hub "17 active" and meta "All 18 AI services", AgentGPanel "17 services", `messages/en.json` "13 Services", catalog "25 Services".
6. **Provider boundary (PROJECT_MASTER §A) is violated on the main paths** (FAILED): image = NanoBananaAI (third party) → Grok → FLUX
   (`lib/services/serviceCatalogue.ts:50-59`); avatar = HeyGen + Replicate SadTalker/Wav2Lip; music cascade includes Udio;
   product ad / motion / swap = Kling (Replicate / Higgsfield); 3D = Replicate TRELLIS; text services and Terminal = Anthropic
   first or as fallback (`app/api/pipeline/route.ts`); Voice page = OpenAI TTS fallback. The Codex branch
   `codex/vertex-ai-migration` starts addressing this but is unmerged and red (see the status report).
7. **Pricing has ≥10 sources** (§5). The studio's button price = route deduction for image / music / avatar / remix / model3d / video
   (BUILT_NOT_PROVEN, unit-tested pairing), but swap / motion / VFX buttons quote `remix` (15) while the route prices with
   `lib/genjutsu/pricing.ts` — a mismatch (R5 violation). Montage, dubbing and presentation charge nothing.

## 1. Registries

| File | Entries | Feeds |
|---|---|---|
| `lib/studio/tools.ts` | 17 (8 primary + 9 more) | **Primary UI**: studio sidebar „სერვისები", „+" sheet, tools picker (`ChatChrome.tsx`), `OmniStudio`, `ServiceHub`, Agent G system prompt (`lib/chat/platformPrompt.ts:26,87`), `/api/plugins`, `workspaceForms.ts` |
| `lib/services/serviceCatalogue.ts` | 10 | OmniStudio path targets, Plugins/Skills tabs |
| `lib/services/workspaceForms.ts` | 14 slug→tool, 11 forms | `/{lang}/services/[slug]` (ServiceWorkspaceView) |
| `lib/services/metadata.ts` | 26 | `/{lang}/services/[slug]` content |
| `app/[locale]/services/page.tsx` | inline 26 (`SERVICE_ITEMS`), 14 (`CATALOG_SLUGS`) | /services marketing page |
| `lib/service-registry.ts` | 22 (comment says 16) | `lib/app/services.ts`, dead shells |
| `lib/services/registry.ts` | 19 (+`next`) | `lib/agents/agentGRouter.ts` → `/api/agents/chat`, `/api/agents/execute`, project version routes |
| `lib/registry.ts` | 14 (own credit table) | legacy `/api/pipeline`, `agent-g-orchestrator`, chat cards |
| `lib/app/services.ts` | 22 (credits default 5) | `/api/app/services/[slug]/run`, workflows runner |
| `lib/services/catalog.ts` | 25 ("25 Services") | `UnifiedServiceLayout`, `lib/agents/contracts.ts` |
| `components/hub/AiHubShell.tsx:64-103` | 19 | `/{lang}/hub` |
| `components/workspace/WorkspaceDashboard.tsx` | 12 | `/{lang}/workspace` |
| `components/studio/hub/skills.ts` | 12 skills | the studio's Connectors·Plugins·Skills sheet (not /hub) |
| `lib/providers/catalogue.ts` | model catalogue (Higgsfield 25, Google 4, NanoBanana 3) | `/api/nanobanana/image`, Studio V2 |

Dead UI (imported by nothing reachable): `components/layout/Sidebar.tsx` (via `AppShellClient`), `components/dashboard/ServicesGrid.tsx`,
`ServiceHomeDashboard.tsx`, `UnifiedServiceShell`, `ServiceExperienceShell`, `components/service/ServiceDashboard`.
Two unrelated "Agent G routers": `lib/agents/agentGRouter.ts` and `lib/router/agentGRouter.ts` (`/api/router`).

## 2. Studio tools (the product people use)

| Tool | Runtime route | Provider(s) today | Price (quote.ts) | Boundary | Status |
|---|---|---|---|---|---|
| chat | `/api/chat/gemini` (+ `/api/chat`, `/api/chat/orchestrate`) | Gemini (AI Studio key); `/api/chat` Anthropic/OpenAI only if `AI_GOOGLE_ONLY` off | 0, daily caps | OK on studio path | BUILT_NOT_PROVEN |
| video | `/api/film/storyboard` → `/api/chat/orchestrate` → `/api/video/assemble` | Veo 3.1 (`lib/veo/*`), ffmpeg | `videoCredits` | OK (V1–V6 unproven) | BUILT_NOT_PROVEN |
| image | `/api/nanobanana/image` | NanoBananaAI → Grok → FLUX | 2 / image | **FAILED** | — |
| photoshoot | `/api/nanobanana/image` | same | image × renders | **FAILED** | — |
| interior | `/api/nanobanana/image`, `/api/orchestrator/interior/produce` | NanoBanana; Gemini + Claude | image price | **FAILED** | — |
| music | `/api/ai/music` | Lyria, ElevenLabs Music, Udio cascade | 5/8/12 | **FAILED** (Udio) | — |
| avatar | `/api/heygen/presenter`, `/api/video/lipsync` | HeyGen, Replicate SadTalker/Wav2Lip, ElevenLabs voice | 20 | **FAILED** | — |
| remix | `/api/video/remix`, `/api/ai/edit*` | ffmpeg, ElevenLabs, Wav2Lip, NanoBanana, Kling/Veo | 15 | **FAILED** | — |
| product | `/api/video/remix` op `productad` | Kling (Replicate) | video × 6 s | **FAILED** | — |
| swap / vfx / motion | `/api/genjutsu/*`, `/api/motion-control` | Veo (vfx); Higgsfield Kling (swap, motion) | quotes 15, route uses genjutsu pricing | **FAILED** + R5 mismatch | — |
| montage | `/api/v2/montage/render` | ffmpeg | none charged | OK | BUILT_NOT_PROVEN |
| dubbing | `/api/v2/dubbing/start` | ElevenLabs Scribe, Gemini, TTS, ffmpeg | none charged | OK | BUILT_NOT_PROVEN |
| model3d | `/api/v2/model3d/*` | Replicate TRELLIS (+ Imagen) | 5 | **FAILED** | — |
| presentation | `/api/v2/presentation/build` | Gemini, Imagen | none charged | OK | BUILT_NOT_PROVEN |
| photo (culling) | on-device worker | none | free | OK | BUILT_NOT_PROVEN |

## 3. Page-only services (`/{lang}/services/<slug>`)

| Slug(s) | Runtime | Provider | Charge | Recommended action (§5 vocabulary) |
|---|---|---|---|---|
| video, image, music, avatar, interior, photo, editing | open the studio tool (`workspaceForms.ts:63-80`) | as §2 | as §2 | KEEP as SEO page → SHORTCUT into studio |
| agent-g, workflow | own pages | — | — | agent-g: PROMOTE (orchestration layer, not a card); workflow: FUTURE (WorkflowPanel fakes runs with `setTimeout`/`Math.random`) |
| text, media, visual-intel, shop, business, next | open chat | Gemini | caps | MERGE into Agent G / Text & Content modes; HIDE `next` |
| prompt / prompt-builder (two slugs) | `/api/pipeline` | Gemini → Anthropic fallback | none (registry advertises 2–4) | MERGE into Text & Content mode |
| content-writer, podcast, character, event, tourism, game | `/api/pipeline` | Gemini Pro → Claude fallback | none (registry advertises 3–8) | MERGE into Text & Content modes (podcast → Voice & Audio) ; tourism/game: DEMOTE/FUTURE |
| terminal | `/api/pipeline` | Anthropic first | none | MOVE under Agent G → Code (sandbox) |
| voice | `/api/pipeline` voice | ElevenLabs, OpenAI TTS fallback | none (registry says 12) | RENAME („Voice Clone" is not what it does) → Voice & Audio |
| software | `/api/orbit/code-generation` → `/api/ai` | Anthropic | **3 credits**, contradicting `workspaceForms.ts:12-13` | MERGE into Code |

## 4. Shells

| Route | Shell | Verdict |
|---|---|---|
| `/{lang}`, `/{lang}/dashboard` | `FilmStudioHome` (ServiceHub + ChatChrome + OmniStudio) | **Primary workspace** |
| `/{lang}/studio` | Studio V2 behind `STUDIO_V2` | feature-flagged; decide merge or retire |
| `/{lang}/hub` | `AiHubShell` | duplicate shell, fake data → redirect to dashboard (§60 step 13) |
| `/{lang}/workspace` | `WorkspaceDashboard` | duplicate, fake data → redirect to dashboard |
| `/{lang}/services[/slug]` | marketing + hand-off | KEEP as SEO; CTA must land in the studio |

## 5. Pricing sources

1. `lib/credits/pricing.ts` (`CREDIT_COSTS`, packs 9/29/89 GEL → 90/290/890 credits) — the studio's canonical source.
2. `lib/billing/pricingConfig.ts` (plans, packs 25/75/149 GEL → 300/1200/2800 credits) — the public /pricing page. **Conflicts with 1**
   (1 credit = 0.10 GEL there vs ≈0.05–0.08 GEL here).
3. `lib/billing/gel.ts` `GEL_COST` · 4. `lib/providers/pricing.ts` (Higgsfield USD × 1.35) · 5. `lib/genjutsu/pricing.ts` ·
6. `app/api/ai/route.ts` `AGENT_COSTS` / `lib/monetization/credits.ts` · 7. `lib/registry.ts` credits · 8. `lib/app/services.ts` credits ·
9. `lib/billing/plans.ts` `ACTION_CREDIT_COSTS` · 10. `lib/services/billing/costModel.ts` (platform budget, not a user charge).

Public /ka/pricing (scraped 2026-10-08): Free $0 / 50 credits, Basic $19.99 / 230, Pro $39.99 / 525, Business $79.99 / 1,200 —
a fourth set of numbers. Which one billing actually posts is §60 step 18.

## 6. Live production snapshot (2026-10-08, public pages only)

- Production serves deployment `dpl_ANGLbd7AGjDQyYHCGk5UJQsrp2Rr` (from asset URLs), older than `main`.
- `/ka/services`: hero says „24 ურთიერთდაკავშირებული … მოდული"; cards are English text on a Georgian page; Agent G shown twice
  (featured + "Automation"); links to `/ka/hub` as „AI სტუდია".
- `/ka/hub`: English-only UI on `ka`, emoji icons (DESIGN.md forbids), fake stats and fake activity (§0.4), „17 active" with 18 links.
- `/ka/pricing`: four plans, USD with GEL approximation.
- Authenticated pages, API health and runtime calls: BLOCKED (sandbox network policy + no test account) — see status report.
