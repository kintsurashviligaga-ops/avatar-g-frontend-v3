# Director's Workflow — Phase 8.2 & 8.3 plan

_2026-11-14. Draft. Built from GG's outline (storyboard, scene cards, audio per scene, 1–10 scenes). GG's earlier full spec did not reach this project; anything below that differs from it gives way to it._

## What the user gets

1. **Idea → storyboard.** The user writes one idea in the chat (or picks "Director" in the Video service) and asks for N scenes, or lets the director choose (1–10).
2. **Scene cards.** The storyboard appears as 1–10 cards. Each card shows: title, what happens, camera note, length (4 / 6 / 8 / 10 s), who is on screen, **the lines each person says**, ambience, sound effects, music (off unless asked), how the scene starts (continues from the previous scene's last frame, from a photo, or fresh) and **its price**. The total price and total length sit under the cards.
3. **Edit.** Add, remove, reorder, duplicate a card; change any field. Problems show on the card (a line too long for the scene, a speaker not on screen …). Nothing is charged while editing.
4. **Approve.** One button: "Create film ✦N". The approval is for that exact version of the board and that exact price.
5. **Render scene by scene.** Each card becomes one clip on today's engines. The live timeline (#272/#275) shows each scene: waiting → rendering → ✓, with its own preview. A failed scene is refunded and can be re-rendered alone.
6. **Final cut.** The clips are joined in order into one film, saved to the Library and shown in the chat. Any scene can be re-done later without re-rendering the rest.

## Rules carried over (not re-decided)

- **Engine per scene = the single-clip rule.** A Georgian line → Gemini Omni 1.2 Flash, each character in their own voice, no narrator. No Georgian line → Veo 3.1 Fast. 10 s → Omni. (`directClipEngine`)
- **A one-scene film costs exactly what the same clip costs today.** Price per scene comes from a pricer: today's price book now, the v8 65 % engine (#343) once its wiring PR lands. The cards never hard-code prices.
- **Audio lives in the scene.** Lines, ambience and effects are asked of the engine for that scene. No TTS dub, no narrator, no music unless the card asks.
- **The words are the user's.** Lines are never translated; the action is translated to English for the engine only (the same reader the Video service uses).
- **Same person in every scene.** Each character's look is written once and repeated word for word in every scene they appear in; "continue from previous" passes the last frame of the scene before as the first frame.

## What already exists and is reused

| Need | Existing code |
| --- | --- |
| One scene = one clip, engines, resolution, price | `lib/video/directClip.ts`, `omniClip.ts`, `veoScene` |
| Prompt rules (own voices, camera on speaker, no narrator, no music) | `lib/video/clipPrompt.ts` |
| Words fit the clip | `clipSpeechFits` / `speechTiming` |
| Translation of the user's words | `lib/video/clipSpeech` reader |
| Last frame → next first frame | `lib/video/lastFrame.ts` |
| Join clips (copy when compatible, re-encode fallback) | `lib/video/longform/stitch.ts` + `runtime.ts` |
| Live per-step progress card | `/api/tasks/stream` timeline (#272, #275) |
| Charge / refund per clip | the direct-clip route (unchanged) |

The older Veo-only film path (storyboard frames → English scene scripts) and the V1–V6 director runs stay as they are; the Director's Workflow does not use them because they rewrite the user's script in English and voice Georgian off camera, which GG rejected on 2026-10-25/26.

## Phases and PRs

**Phase 8.2 — storyboard and scene cards (no generation)**
- **PR A (this PR):** `lib/video/directorsWorkflow/` — scene model, checks, per-scene engine and price, card edits, scene → prompt, storyboard planner instruction + strict reader, flag `DIRECTORS_WORKFLOW` (off / admin / everyone). Pure code, 19 tests, nothing wired, $0.
- **PR B:** `POST /api/video/director-workflow/plan` (one Vertex Gemini call → draft board, free or a small fixed planning price — GG to say) and the scene-card UI in the Video service, behind the flag. Screenshots at 390 / 1440.

**Phase 8.3 — render, audio, final cut**
- **PR C:** the run: approve → hold the total, render scenes in order through the direct-clip path (scene N+1 waits for scene N's last frame only when it continues from it; independent scenes render in parallel, max 2), refund any failed scene, timeline card per scene.
- **PR D:** final cut with `longform/stitch`, Library entry, "re-do scene 3", and the paid check on myavatar.ge (admins, GG-approved budget).

## Decisions for GG

1. **Planning price.** Making the storyboard is one cheap Gemini text call (≈ $0.002). Free, or ✦1?
2. **Mixed resolutions.** Veo 8 s renders 1080p, Omni defaults to 720p. Joining them needs a re-encode to one size. Recommend: when a board mixes engines, Omni scenes render at 1080p so the film is 1080p throughout (costs more per Omni scene), or offer the user a 720p / 1080p choice for the whole film.
3. **Charging.** Recommend: hold the full total on approve, charge each scene when it is delivered, refund failed scenes automatically. (Today a single clip is charged up front and refunded on failure; holding needs no new ledger code, only one charge per scene.)
4. **Length cap.** 10 scenes × 10 s = 100 s maximum. OK, or cap total length lower (e.g. 60 s) for non-admins?
5. **Music across scenes.** Per-scene music cues (as built) can change between cuts. Should a whole-film music bed be an option in PR D (Lyria, mixed under the dialogue), or stay out as GG asked for single clips?

## Not in scope

No billing, credits, BOG, ledger or prod DB changes. No paid tests until Supabase is back and GG approves a budget. Flags stay off.
