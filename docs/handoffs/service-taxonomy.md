# Service taxonomy, canonical/shortcut matrix and migration matrix — 2026-10-08 (Master Task §60 steps 3, 8, 9)

What this file is: the Deep Research write-up (Master Task §4), the canonical taxonomy as it is now built
(`lib/catalog/services.ts`, §7 / §23), the canonical/shortcut matrix (§24) and the migration matrix (§48), with
every place where the build departs from the Master Task's defaults and why.

Inputs: the service inventory (`docs/handoffs/service-inventory.md`, §60 step 7), the repository on branch
`claude/launch-certification-wmvitt`, and a vendor benchmark read live on 2026-10-08 (§1). The owner asked Claude to do
the Deep Research itself on 2026-10-08; no external report exists.

Statuses use the Master Task vocabulary. Everything in §2–§6 is **BUILT_NOT_PROVEN**: unit-tested
(`lib/catalog/*.test.ts`, `lib/chat/studioIntent.test.ts`, `components/studio/agentRoute.wiring.test.ts`), not yet
exercised end to end in a browser or against a paid provider.

## 1. Deep Research: how comparable products organise their capabilities

Method: product and help pages fetched live on 2026-10-08 (Firecrawl `maxAge:0` and WebFetch), vendor pages only, no
logins. "Not found" means not found on the pages read. [E] = read on the cited page; [I] = inference.

### 1.1 Six patterns every benchmark shares [E]

1. **3–5 top-level categories, by output medium.** Firefly: Image, Video, Audio ([firefly.adobe.com](https://firefly.adobe.com)).
   Higgsfield: Image, Video, Audio, Edit ([higgsfield.ai](https://higgsfield.ai)). Gemini: Image, Video, Music generation
   ([gemini.google/about](https://gemini.google/about/)). Runway groups its Apps "by the type of output"
   ([help](https://help.runwayml.com/hc/en-us/articles/45570040112531)). Use cases are a separate lens (Runway Use Cases,
   Krea Solutions, CapCut Use cases).
2. **A model is never a category or a service.** It is a picker or a URL parameter: Higgsfield `/ai/video?model=…`,
   Runway `generate?mode=tools&tool=video&model=gen4.5` ([runway.com/product](https://runway.com/product)), Firefly's
   "Adobe models / Partner models" picker. Agents default to **Auto**.
3. **Input variants and styles are modes or presets of one service.** Flow: Text / Frames / Ingredients to Video
   ([labs.google/flow/about](https://labs.google/flow/about)); Higgsfield Effects "Recreate" presets and Marketing Studio
   formats ([marketing-studio-intro](https://higgsfield.ai/marketing-studio-intro)).
4. **One canonical home per feature, shortcuts elsewhere.** ElevenLabs "Avatars" opens `app/image-video?modality=lipsync`
   ([elevenlabs.io/avatars](https://elevenlabs.io/avatars)); Firefly makes lip sync a toggle inside Translate video
   ([helpx](https://helpx.adobe.com/firefly/web/work-with-audio-and-video/work-with-video/translate-video.html)).
5. **The agent is a layer over the same tools, never a content category.** Adobe: "the connective layer across every stage"
   ([news.adobe.com, 2026-06-18](https://news.adobe.com/news/2026/06/adobe-unveils-major-expansion)); Canva AI 2.0 "a new
   architecture layer" ([newsroom](https://canva.com/newsroom/news/canva-create-2026-ai)); Higgsfield Supercomputer "shows
   the credit cost upfront… You approve the spend, then it generates" ([supercomputer-intro](https://higgsfield.ai/supercomputer-intro)).
   Research and code appear only through the agent (Gemini Deep Research, Canva Code).
6. **Status is labelled, counts still drift.** Canva "Coming Soon" vs "available now" ([canva.com/canva-ai](https://www.canva.com/canva-ai/)),
   Kling "Coming Soon", Firefly "Beta". Yet ElevenLabs says both 5,000+ and 10,000+ voices on one homepage, and Higgsfield
   both 100+ and 40+ avatars on one page — the failure §26 forbids.

### 1.2 Where the benchmarks put the cross-category features [E]

| Feature | Benchmarks |
|---|---|
| Music video | No dedicated nav entry; Flow names music videos as a use of its video studio. |
| Dubbing | Firefly: Translate audio under Audio, Translate video under Video; ElevenLabs: its own Localize app; Higgsfield: inside Audio. |
| Lip sync | Always a video-output feature, usually branded "avatars" (Higgsfield Lipsync Studio, ElevenLabs Avatars, Runway Image to Dialogue). |
| Character swap | Higgsfield "Face & Identity" group, image and video (Character Swap 2.0, Recast). |
| Product ad | An intent studio (Higgsfield Marketing Studio), a marketing agent (Runway), an assistant skill (Adobe "Short product video"). |
| Podcast | ElevenLabs Studio (audio); Higgsfield "Podcast Producer" agent employee. |
| Interior, VFX, motion transfer | Presets, skills or modes under Image/Video (Adobe "Style an interior" skill, Higgsfield Effects, Krea Motion Transfer, Kling Motion Control). |
| 3D, presentation | 3D a peer tool only at Higgsfield and Krea; presentation only at Canva, as a Design document type. |

### 1.3 What MyAvatar takes from this [I]

The benchmark is used to test the Master Task's default taxonomy, not to copy anyone's navigation (§4):

- Creative categories by output medium, kept few: **Video, Image & Photo, Avatar, Music, Voice & Audio** (create), then
  **Text & Content, Design, Code** (work). Avatar stays a category because it is the brand and the market gives avatars
  a prominent place (Higgsfield AI Influencer, Kling Avatar 2.0, Flow Characters/Avatars).
- **Search & Research and Code are Agent G capabilities**, not creative cards — every benchmark exposes them only through
  the agent.
- **Models, aspect ratios, input types and styles are parameters**, never services (§6: "Veo is not a Service", "9:16 is
  not a Service").
- **Agent G is the composer layer** over the catalog: it may only call catalog services, shows the quote and waits for
  approval before spending (pattern 5).
- **Counts are computed** from the catalog at render time (pattern 6, §26).

## 2. The canonical taxonomy as built (`lib/catalog/services.ts`)

9 categories in 3 menu groups (`SERVICE_CATEGORIES`, `lib/catalog/nav.ts`):

| Group | Categories |
|---|---|
| Agent G (first, on its own) | the chat; Writing, Code and Web search are reached through it |
| Create | Video · Image & Photo · Avatar · Music · Voice & Audio |
| Work | Text & Content · Design · Code (Search & Research folds into Agent G: its only runtime is the chat) |

22 services. Each runs on exactly one studio tool (`lib/studio/tools.ts`, the runtime and the `?tool=` deep link) and is
priced by exactly one quote key (`lib/credits/quote.ts`, R5). `boundary` is PROJECT_MASTER §A on today's runtime path.

| Catalog id (= analytics id) | Category | Tool | Quote key | Status | §A boundary today |
|---|---|---|---|---|---|
| video.generate (modes: text, documentary) | Video | video | video | live | google (Veo; V1–V6 unproven) |
| video.music-video (mode musicvideo) | Video | video | video | live | google |
| video.product-ad | Video | product | product | live | **violation**: Veo → Kling via Replicate → Ken Burns still |
| video.character-swap | Video | swap | swap | live | **violation**: roop via Replicate (`/api/video/remix` `character`); the Genjutsu panel's swap is Kling via Higgsfield. R5 holds (15 = 15) |
| video.motion | Video | motion | motion | live | **violation**: Kling via Higgsfield / Replicate |
| video.vfx | Video | vfx | remix | live | google (Veo); R5 gap |
| video.remix | Video | remix | remix | live | **violation**: Kling / Wav2Lip / NanoBanana on some ops |
| video.editing | Video | montage | — (free today) | live | google (ffmpeg) |
| image.generate | Image & Photo | image | image | live | **violation**: NanoBananaAI → Grok → FLUX |
| image.photoshoot | Image & Photo | photoshoot | photoshoot | live | **violation**: same cascade |
| image.interior | Image & Photo | interior | interior | live | **violation**: NanoBanana; Claude for style |
| image.culling | Image & Photo | photo | — (free) | live | google (on-device, no provider) |
| avatar.talking | Avatar | avatar | avatar | live | **violation**: HeyGen, Replicate SadTalker/Wav2Lip |
| music.generate (modes: song, instrumental) | Music | music | music | live | **violation**: Udio in the cascade |
| music.remix | Music | — | — | coming-soon | — |
| voice.dubbing | Voice & Audio | dubbing | — (free today) | live | google (ElevenLabs + Gemini) |
| text.write (modes: content, video-script, podcast, prompt, translate) | Text & Content | chat | chat | live | google |
| design.presentation | Design | presentation | — (free today) | live | google (Gemini + Imagen) |
| design.model3d | Design | model3d | model3d | beta | **violation**: Replicate TRELLIS |
| code.assistant | Code | chat | chat | live | google |
| code.terminal | Code | — | — | coming-soon | — (sandbox not built) |
| research.web-search | Search & Research | chat | chat | live | google (Search grounding) |

`live` means the tool is reachable today. It is not a claim that the provider path is proven or allowed: 10 of the 20 usable
services (live + beta) sit on a §A violation, which the Vertex/Imagen/Lyria migration (PROJECT_MASTER Part 2) owns. The catalog keeps
them visible as `violation` so no report can call the boundary clean.

## 3. Canonical / shortcut matrix (§24)

A shortcut opens the **same** catalog service (same `serviceHref`, same tool), never a second implementation.

| Capability | Master Task default | Built | Shortcut from | Why |
|---|---|---|---|---|
| Music video | Video | **Video** › `video.music-video` (`mode=musicvideo`) | Music | Agrees with default; no benchmark gives it a category; Flow treats it as a video use. |
| Dubbing | Voice & Audio | **Voice & Audio** › `voice.dubbing` | Video | Agrees; matches ElevenLabs Localize and Firefly Translate. |
| Lip sync | Voice & Audio / shared | **Avatar** › `avatar.talking` (aliases "lip sync", „ალაპარაკე", „липсинк") | — | Departs: the only lip-sync runtime is the avatar tool, and every benchmark files lip sync as video output branded as avatars. A lip-sync toggle inside dubbing is FUTURE. |
| Character swap | Video | **Video** › `video.character-swap` | Avatar | Agrees with default. The benchmark leans to an identity group (Higgsfield Face & Identity), but the runtime takes a video and returns a video. |
| Product ad | Video | **Video** › `video.product-ad` | Image & Photo | Agrees; ad formats (UGC, packshot) become modes, not services. |
| Podcast | Voice & Audio | **Text & Content** › `text.write` mode `podcast` (a script) | — | Departs for now: there is no multi-voice audio runtime, only a script. FUTURE `voice.podcast` in Voice & Audio; the script mode then becomes its shortcut. |
| Video script | Text | **Text & Content** › `text.write` mode `video-script` | Video | Agrees. |
| Soundtrack | Music | **Music** › `music.generate` (alias "soundtrack") | Video | Agrees; matches Firefly "Generate music for videos". |
| Audio remix vs video remix (§25) | split | `music.remix` (coming-soon) and `video.remix` | — | „მუსიკა დამირემიქსე" resolves to the audio remix and is told it is not available yet, with Generate music offered — never the video remix. |

Kept as services although the benchmark files them as presets: **interior, VFX, motion transfer, photographer**. Each has
its own studio panel, route and quote key today, so folding them into a parent service would hide a different price behind
the same button. They are recorded as preset candidates for when the image runtime moves to Imagen (Part 2) and the video
effects share the Veo path.

## 4. Modes versus services (§53)

The rule the catalog applies: **a new service needs its own runtime (studio tool) or its own price.** Anything that only
changes the input, the style, the length, the aspect ratio or the model is a mode or a parameter of an existing service.

- Built as modes: `video.generate` text / documentary; `video.music-video` musicvideo; `music.generate` song / instrumental;
  `text.write` content / video-script / podcast / prompt / translate.
- Never services: Veo, Imagen, Lyria, Gemini, ElevenLabs (models/providers), 9:16 / 16:9, 8 s / 6 s, styles.
- Categories never list one card per mode (§53's "five top-level video cards" example is impossible: a mode has no card).

## 5. Agent G routing (§16, §52)

Agent G is the chat, first in every menu. A typed request reaches a service through layers that each own different tools,
so no sentence has two routers:

| Order in `OmniStudio.send()` | Router | Owns |
|---|---|---|
| 1 | guest gate | signs in a guest before any paid tool, including a catalog route |
| 2 | chat lanes / Agent G card | image, music (card with quote and approval) |
| 3 | `tryAgentGRoute` | the editor |
| 4 | `lib/chat/studioIntent.ts` | dubbing, avatar, montage, presentation, 3D |
| 5 | `lib/catalog/agentRoute.ts` (new) | product ad, character swap, motion, VFX, video remix, interior, photographer; coming-soon services |
| 6 | confirmed chat lanes, video route | video storyboard |

Rules, each pinned by a test:

- Deterministic, no model call. A route only **opens** the tool; nothing renders or charges until the person presses the
  priced button (`agentRoute.wiring.test.ts` forbids `fetch`, run calls and `/api/` in the branch).
- A question or a statement opens nothing (`isServiceQuestion`, `looksLikeRequest`): „რა ღირს რეკლამა?" is answered in prose.
- A coming-soon service is named as unavailable with the nearest usable service in its category; it is never substituted.
- Generic medium words ("video", „ვიდეო", "image") only decide when nothing more specific was said, so
  "swap the character in this video" is a swap, not a new video.
- Georgian and Russian case endings match the nominative alias („ინტერიერის", „фотосессию").

Master Task §52 examples, as built:

| Intent | Expected | Built |
|---|---|---|
| „გამიკეთე მუსიკალური ვიდეო." | video.music-video | catalog resolves video.music-video (`services.test.ts`); in the chat the music card yields to the video lane (`OmniStudio.tsx`, `!isVideoIntent` guard), never music generation |
| „ამ ვიდეოს ხმა ქართულად გადამითარგმნე." | voice.dubbing with video context | dubbing tool, `targetLanguage: ka` (studioIntent) |
| „ამ ბიჭით იგივე ვიდეო გააკეთე." | video identity workflow | video.character-swap opens the swap tool |
| „მუსიკა დამირემიქსე." | audio remix, not video remix | music.remix → "not available yet", offers Generate music |

## 6. Migration matrix (§48, §49)

Action vocabulary from §5. "Route" is where the CTA lands; old URLs keep working (§49).

### 6.1 Studio tools

| Current | → Category | → Catalog id | Mode / preset | Route | Redirect |
|---|---|---|---|---|---|
| chat | Agent G | text.write, code.assistant, research.web-search | text modes | `/{lang}/dashboard` | — |
| video | Video | video.generate, video.music-video | text, documentary, musicvideo | `?tool=video[&mode=…]` | — |
| product | Video | video.product-ad | (formats FUTURE) | `?tool=product` | — |
| swap | Video (+Avatar shortcut) | video.character-swap | — | `?tool=swap` | — |
| motion | Video (+Avatar shortcut) | video.motion | — | `?tool=motion` | — |
| vfx | Video | video.vfx | preset candidate | `?tool=vfx` | — |
| remix | Video | video.remix (audio half split off as music.remix) | — | `?tool=remix` | — |
| montage | Video | video.editing | — | `?tool=montage` | — |
| image | Image & Photo | image.generate | — | `?tool=image` | — |
| photoshoot | Image & Photo | image.photoshoot | — | `?tool=photoshoot` | — |
| interior | Image & Photo | image.interior | preset candidate | `?tool=interior` | — |
| photo | Image & Photo | image.culling | — | `?tool=photo` | — |
| avatar | Avatar | avatar.talking | lip sync | `?tool=avatar` | — |
| music | Music (+Video shortcut) | music.generate | song, instrumental | `?tool=music` | — |
| dubbing | Voice & Audio (+Video shortcut) | voice.dubbing | — | `?tool=dubbing` | — |
| presentation | Design | design.presentation | — | `?tool=presentation` | — |
| model3d | Design | design.model3d (beta) | — | `?tool=model3d` | — |

Every studio tool belongs to a catalog service (`toolsInCatalog()` test), so none is orphaned from the menus.

### 6.2 Legacy service pages (`/{lang}/services/<slug>`)

The page stays (SEO, §49); its CTA opens the catalog service in the studio via `LEGACY_SLUG_TO_SERVICE`.

| Slug | Page today | Action | → Catalog id |
|---|---|---|---|
| video, editing, image, photo, interior, avatar, music | studio hand-off | KEEP + SHORTCUT | video.generate, video.editing, image.generate, image.photoshoot, image.interior, avatar.talking, music.generate |
| content-writer, text, prompt, prompt-builder, event | text via `/api/pipeline` or chat | MERGE | text.write (content / prompt modes) |
| podcast | text via `/api/pipeline` | MERGE now, MOVE later | text.write › podcast; FUTURE voice.podcast |
| character ("Character AI") | text via `/api/pipeline` | MERGE + RENAME (§25: it is a character sheet, not a swap) | text.write |
| software, terminal | Anthropic code generation / pipeline | MERGE / MOVE | code.assistant; terminal FUTURE as code.terminal (sandbox) |
| voice ("Voiceover") | `/api/pipeline` voice: ElevenLabs, OpenAI only with `AI_GOOGLE_ONLY=0` | RENAME (done: Voiceover, not "Voice Clone") → FUTURE `voice.voiceover` | none yet: it is not dubbing, so it is not mapped to dubbing |
| agent-g | own page | PROMOTE | Agent G layer (not a card) |
| workflow | WorkflowPanel faked runs (`setTimeout`/`Math.random`) | FUTURE | — |
| media, visual-intel, shop, business | chat | MERGE into Agent G | text.write / research.web-search |
| next ("Expansion Slot") | placeholder | HIDE | — |
| tourism, game | text via `/api/pipeline` | DEMOTE / FUTURE | — |

Fixed on this branch: the voiceover page now speaks exactly what was typed (it read the whole prompt template aloud) and
no longer falls back to OpenAI TTS while `AI_GOOGLE_ONLY` is on (default), proven by `app/api/pipeline/voice.test.ts`
(4 tests, red on the old code). The text pages still fall back to Anthropic inside `/api/pipeline`; that is Part 2 scope.

### 6.3 Shells

| Route | Before | Now |
|---|---|---|
| `/{lang}`, `/{lang}/dashboard` | studio | the one primary workspace |
| `/{lang}/hub`, `/{lang}/hub/*` | AiHubShell, fake stats, `/api/ai` text-only "Image Creator" that charged for images | **redirect** to `/{lang}/dashboard` (`next.config.js`); shell, panels and the pipeline store/hook deleted |
| `/{lang}/workspace`, `/{lang}/workspace/*` | WorkspaceDashboard, same fake stats | **redirect** to `/{lang}/dashboard`; deleted |
| `/{lang}/studio` | Studio V2 behind `STUDIO_V2` | unchanged (307 home when off); merge-or-retire decision open |
| `/{lang}/services` | 26 hand-kept cards, "24 modules" | reads the catalog; the count is `countServices()` |

### 6.4 The nine registries

| Registry | Fate |
|---|---|
| `lib/catalog/services.ts` | **the SSoT** |
| `lib/studio/tools.ts` | KEEP as the runtime list; grouped by `lib/catalog/nav.ts` (the old PRIMARY/MORE split is gone from every menu) |
| `lib/services/metadata.ts`, `lib/services/workspaceForms.ts` | KEEP as page content; CTAs resolve through `LEGACY_SLUG_TO_SERVICE` |
| `lib/services/serviceCatalogue.ts` | still read by OmniStudio path targets and the Skills tab; DEPRECATE into the catalog |
| `lib/registry.ts` (10 importers), `lib/services/registry.ts` (6), `lib/service-registry.ts` (6), `lib/app/services.ts` (3), `lib/services/catalog.ts` (2) | still imported by legacy API routes (`/api/pipeline`, `/api/agents/*`, `/api/app/services/*`) and dead shells; DEPRECATE with those routes. Their credit tables must not be shown to anyone (§36, pricing step 18). |
| `components/hub/AiHubShell.tsx`, `components/workspace/WorkspaceDashboard.tsx` | **deleted** with the shells |

## 7. Status honesty and what is still open

- §26 counts: `/services` and the Agent G system prompt read the catalog; `messages/{ka,en,ru}.json` lost the hard-coded
  "13 Services". Other hard-coded counts outside these pages are not yet swept (step 21/SEO).
- §50 analytics identity: the catalog id is the analytics id. The events (category viewed, service opened, quote shown,
  generation confirmed / completed / failed, saved) fire from `lib/analytics/serviceEvents.ts`: **BUILT_NOT_PROVEN**
  (certification §C lists what they cover and what not).
- §51 search: `resolveService` answers KA/EN/RU aliases (dubbing, music video, product ad, lip sync, character swap,
  podcast are all tested) and powers Agent G. `searchServices` uses the same aliases plus labels and modes for the
  sidebar's search box (half-typed words, Agent G's pick first, coming-soon shown as unavailable): **BUILT_NOT_PROVEN**
  until deployed. A found service opens with its mode (Music video → Video in music-video mode).
- §A boundary: 10 usable services on a violation path (§2). Fixing them is Part 2, blocked on Part 0 AUTH (STOP-1).
- R5: re-checked in step 18. Swap, motion, product ad and the Genjutsu panel quote what their routes charge (the earlier
  "swap / VFX quote `remix`" finding was wrong). Montage, dubbing and presentation charge nothing.
