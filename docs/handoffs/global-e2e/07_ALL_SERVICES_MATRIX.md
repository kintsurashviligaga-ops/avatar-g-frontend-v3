# 07 — All services: pipeline matrix and GO/NO-GO

Columns = the brief's pipeline. P = PROVEN_PRODUCTION, PV = PROVEN_PREVIEW, I = PROVEN_ISOLATED, B = BUILT, Pa = PARTIAL,
X = BLOCKED, – = n/a, O = OFF. "Prov" = real provider call evidenced.

| Service | UI | Route | Auth | Quote | Confirm | Prov | Job | QC | Private storage | Library | Download | Refund | GO/NO-GO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chat / Agent G text | P | P | P | – | – | P | – | – | – | history | – | – | **GO** (live today) |
| Video Studio (#64) | I | I | I | I | I | **PV** (Veo ×2 today) | I | **I (real bytes)** | I | I | I | I | **NO-GO** until #64 merged + Preview isolation run (X) |
| Image Studio (#60) | I | I | I | I | I | **PV** (generate + edit today) | I | I | I | I | I | I | **NO-GO** (flag OFF; enable after isolated deployed run) |
| Music Studio (#65) | I | I | I | I | I | PV (Lyria ×3) | I | I (real bytes) | I | I | I | I | **NO-GO** (flag OFF; vocals OFF; worker+real Lyria deployed = X) |
| Montage / editing | B | B | B | – (free) | – | – | B | I (real Veo) | B | B | B | – | GO-CANDIDATE (free, ffmpeg) after Linux CI green |
| Avatar | B | B | B | B | price button | third party | B | – | B | B | B | B | NO-GO — provider-boundary decision |
| Remix / product / motion / swap / model3d / photoshoot / interior | B | B | B | B | partial | third party | B | – | mixed | B | B | B | NO-GO — boundary decision; no live test (Google-only budget) |
| VFX scene (Veo) | B | B | B | B | quote | – | B | – | – | – | – | B | NO-GO (no live run of this route) |
| Dubbing | B | B | B | **none** | none | ElevenLabs | B | – | B | B | B | – | **NO-GO — paid output, 0 credits** |
| Presentation | B | B | B | **none** | none | Gemini+Imagen | B | – | signed | B | B | – | **NO-GO — paid output, 0 credits** |
| Voice (/services/voice) | B | B | B | **none** | none | ElevenLabs | – | – | **none** (data URL) | no | inline | – | **NO-GO — paid output, 0 credits, no storage** |
| Text forms (prompt builder, content writer, podcast, terminal, game, event, character, tourism, business) | B | B | B | – | – | Gemini | – | – | – | no | copy | – | GO (free text; rate-limited) |
| Software (/services/software) | B | B | B | **hidden** (3 cr charged, page shows none) | – | Gemini | – | – | – | no | – | B | fix copy, then GO |
| Workflow Builder · Online Shop · Visual Intelligence · Media hub · Text Intelligence pages | catalogue copy | chat only | – | – | – | Gemini | – | – | – | – | – | – | **NO-GO as advertised** — copy promises capabilities that do not exist (01 §B); either rewrite copy or hide |
| Social Media Manager | — | no service | – | – | – | – | – | – | – | – | – | – | **does not exist**; no public posting path (none tested, none approved) |
| Photo culling | B | none (on device) | – | – | – | – | – | – | device | no | – | – | GO |
| Payments (BOG) | — | sandbox only | — | — | — | — | — | — | — | — | — | — | out of scope here (PR #62 draft); no real charge made |

Overall: **Production NO-GO for the new Studios**; Production stays as it is (chat + legacy tools live).
