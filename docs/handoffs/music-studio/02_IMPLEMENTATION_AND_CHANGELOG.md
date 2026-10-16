# Music Studio v1 — 02 Implemented capabilities, remaining gaps, engineering changelog

## Implemented (BUILT + tested; not yet seen on Preview/Production)

### Flow: Idea → Plan → Quote → explicit Confirm → Reservation → Generation → QC → Final audio → Library
| Step | Implementation |
|---|---|
| Idea / prompt | Music tool panel (`runMusicJob`) or Agent G words (`lib/music/studio/commands.ts`, ka/en/ru) → a draft |
| Plan | `planFor()` — request validated by `MusicRequestSchema` (strict zod), checked against the **evidence-based** capability matrix (`capabilities.ts`); the exact text Lyria will receive is returned (`providerInput`) |
| Quote | `POST /api/music/studio/quote` — credits from the canonical `quoteCredits({tool:'music', seconds})`; HMAC token (`lib/agent/media/quoteToken`) binds user, job id, plan fingerprint, credits, 30 min expiry. Never charges |
| Confirm | `POST /api/music/studio/jobs` requires `confirmed: true` + the token; the card's button shows the quoted credits (`Create · 5 credits`) |
| Reservation | Exactly the quoted credits under ref `music-studio-v1:<jobId>` (`reserveProduce`, `refuseReplay`); unbilled renders are never allowed. Spend guard checked **before** money moves, **fail-closed** |
| Generation | Leased worker (`lib/orchestrator/jobLease`) started after the response; status poll and the per-minute sweep take over a dead worker. Lyria via Vertex (preferred) or Gemini API |
| QC | Real ffmpeg decode of the bytes: audio stream, length window, not silent (`audio.ts measureAudio/assertDeliverable`) |
| Final audio | Private `renders` bucket `music-studio/<userId>/<jobId>.<ext>`, 1 h signed URL re-minted on every status read |
| Library | The `generation_jobs` row (service `music`) **is** the Library entry; `result` carries model, transport, prompt, lyrics, settings, QC, credits, parent id |

### Controls
Instrumental (offered); vocal song (**gated** until verified); lyrics ka/en/ru (`lyricsLanguage`), custom lyrics passed verbatim; lyrics assistant (existing `/api/ai/lyrics`); genre, mood, tempo or BPM, vocal gender; length = the model's own (Lyria Clip ≈ 30 s, shown as "≈ 30 s", never "exact"); Regenerate = same settings, `parentJobId`, **new quote**; templates/saved styles = the existing panel templates feed the draft (genre/tempo); model selection only among verified models.

### Edits (ffmpeg, free, non-destructive) — `POST /api/music/studio/edit`
trim · volume (−60…+12 dB) · mute · fade in/out · join 2–6 tracks (concat or crossfade) · convert mp3/wav/m4a. Sources are the caller's own Library rows **by id** (never by URL); output is a new Library row with `parentJobIds`; the result is re-measured and refused if its length is off by > 0.5 s, it has no audio stream, or it is silent (unless muted).

### Agent G + One Window
`MusicStudioCard` in the Agent G thread (`components/studio/OmniStudio.tsx`, behind `NEXT_PUBLIC_MUSIC_STUDIO_V1=1`): plan chips → price → Confirm → named stages (`Queued… / Reserving credits… / Lyria is composing… / Checking quality…`, **no percentages**) → Cancel → inline `<audio>` player + Download → edit box (Agent G words) producing new versions under the original → Regenerate → "Saved to your Library". The started job id is remembered per draft (localStorage), so a reload/locked phone returns to the same job. KA/EN/RU copy, 44 px targets, `aria-live`, `role=alert/status`, labelled input.

### Provider boundary (Phase 2)
`/api/ai/music` runs **Lyria only**; Udio / ElevenLabs Music / MusicGen picks, covers, sampled voice (MiniMax), trained voice (RVC) → `400 unsupported` before any charge, regardless of `MEDIA_GOOGLE_ONLY`. Pollinations cover art removed. `/api/udio/generate`, `/api/orchestrator/music/produce` retired (refuse). Chat music lane points to the Music tool. `edit-audio` Demucs stems refused. Engine picker shows only Lyria as available. `musicWithinBudget` fails closed.

## Remaining missing functionality (honest)
| Item | State | Why |
|---|---|---|
| Sung vocals | BLOCKED on Phase 8 | Not verified on this project; enabling = `MUSIC_LYRIA_VOCALS_VERIFIED=1` after the paid test |
| Lengths other than ≈ 30 s | NOT OFFERED | Lyria Clip has no duration parameter; Lyria Pro unverified |
| Remix, extension, stems, vocal removal, cover, voice conversion, dubbing, RealTime | NOT OFFERED | No compliant backend proven; commands answer "not available" |
| Pitch / speed in Music Studio | NOT OFFERED in v1 | Exists in the older `edit-audio` `process` op; not ported |
| Live Voice commands | NOT WIRED | The card accepts typed Agent G words; the Live Voice tool registry (`bindLiveAgent`) was not changed to avoid colliding with PR #60's registry edits |
| Panel-level "saved styles" persistence | PARTIAL | Uses existing panel templates; no new saved-style store |
| Cover art for tracks | NONE | Pollinations removed; a Google image cover is an owner decision |
| Paid edits | — | Edits are free (as the existing ffmpeg op); pricing is an owner decision |
| Playwright desktop/mobile E2E of the card | NOT RUN | See 04_TEST_EVIDENCE |

## Engineering changelog (branch `claude/music-studio-v1-20261014`)
- **New** `lib/music/studio/`: `contracts.ts`, `capabilities.ts`, `prompt.ts`, `engine.ts`, `live.ts`, `audio.ts`, `edit.ts`, `commands.ts`, `client.ts`, `copy.ts`, `http.ts`, `errors.ts`, `boundary.ts` + tests (`engine.test.ts` 21, `audio.ffmpeg.test.ts` 8, `commands.test.ts` 25, `musicIsolation.pg.test.ts` 6).
- **New** routes `app/api/music/studio/{capabilities,quote,jobs,jobs/[id],jobs/[id]/cancel,edit,commands,sweep}`; `vercel.json` cron `/api/music/studio/sweep` every minute; `next.config.js` ffmpeg tracing for the four ffmpeg routes.
- **New** `components/studio/music/{MusicStudioCard.tsx,musicCardCopy.ts,musicDraft.ts}` + test (6); OmniStudio: `musicDraft` message field (persisted), card render, `runMusicJob` branch behind the client flag.
- `lib/ai/lyriaMusic.ts`: `musicWithinBudget` fails closed (throw or degraded ledger ⇒ refuse); new `lyriaRequest(input, model, signal)` (exact input, abortable, caption extraction).
- `app/api/ai/music/route.ts`: Lyria-only; outside engines/references refused before reserve; Pollinations removed.
- `lib/ai/musicEnginesStatus.ts`, `lib/pipeline/statusAgent.ts`: only Lyria configurable.
- `lib/chat/providerRouter.ts`: chat music always refused (Udio/MusicGen handler removed).
- `app/api/udio/generate`, `app/api/orchestrator/music/produce`: retired; `app/api/ai/edit-audio`: Demucs refused.
- Tests updated to the new policy (not weakened — each removed "engine X runs" test is replaced by a stricter "engine X is refused, nothing charged, no engine called" test): `app/api/ai/music/{style,controls,engine-reference,noFallback,template}.test.ts`, `engines/route.test.ts`, `lib/studio/musicEngines.test.ts`, `lib/chat/providerRouterMediaPolicy.test.ts`, `app/api/ai/edit-audio/billing.test.ts`, `app/api/udio/generate/route.test.ts`, `lib/providers/mediaPolicy.ts` GATED_ENTRIES, `__tests__/provider-boundary.allowlist.json` (Pollinations entry removed), `__tests__/api-lockdown.test.ts` (`musicUser` gate; capabilities route allowlisted with reason), `lib/orchestrator/produceBilling.test.ts`, `lib/pipeline/statusAgent.test.ts`.
- `scripts/lease-isolation/run.sh`: runs the Music suite; `scripts/music-studio/paid-e2e.ts` (refuses without owner approval).
- **No database migration. No Production change. No paid provider call.**
