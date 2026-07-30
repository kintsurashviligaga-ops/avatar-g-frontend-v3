# Preview-deploy check — sidebar, personas, and the three new studios

Every claim below was verified by reading the code on `main`, not assumed. Where something is
**unverified**, it says so.

---

## 0 · Pre-flight (do this first or you will file phantom bugs)

**Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist in the *Preview*
environment**, not only Production. If they are Production-scoped, `lib/supabase/browser.ts` returns null,
`ChatChrome` calls `.auth.getUser()` on it, and the whole `/[locale]` segment falls into the error
boundary — the sidebar never renders at all. A console error reading
`Cannot read properties of null (reading "auth")` is that, not a UI bug.

This is not hypothetical: the same missing-env failure blocked local browser verification of this work.

**Wait for the build to finish before testing.** Until it is Ready, Vercel serves an HTTP 200 placeholder
(`<title>Deployment is building</title>`) for *every* path, which makes broken routes look healthy.

Preview is anonymous — the myavatar.ge session cookie is domain-scoped — so everything below is
guest-verifiable except the studio submits, which require sign-in (all four routes `requireUser`).

---

## 1 · Sidebar (already-shipped behaviour + this change)

| # | Step | Expect |
|---|------|--------|
| 1 | `/ka/dashboard` | Sidebar renders. Bottom block: Services · Library · Favorites · Persona · Billing · Settings |
| 2 | Expand **Services** | Exactly **10** rows. **9 are live; only 3D Model is dimmed with a "Soon" badge** |
| 3 | Click **3D Model** | Nothing happens — it is inert by design (`live: false`) |
| 4 | Click **Montage** | Navigates to `/ka/montage`. **This is the regression fix** — see §4 |
| 5 | Click **Presentation** | Navigates to `/ka/slides` |
| 6 | Click **Dubbing** | Navigates to `/ka/dubbing` |
| 7 | Click **Video**, then **Image** | Hash targets (`#film`, `#omni`). ⚠️ See the known hash defect in §4 |
| 8 | `/en/dashboard`, `/ru/dashboard` | No Georgian leaking through. `serviceName` falls back to **ka**, so a missing ru string surfaces as Georgian rather than English |
| 9 | Mobile 375×812 | Drawer opens above the cookie banner; all rows reachable |

---

## 2 · Personas — **this now does something it did not do before**

Previously the picker persisted a selection that **no client ever sent**. `/api/chat/gemini` accepted
`personaId` and `customPersona` and applied them, but `OmniStudio` never put them in the request body, so
the entire persona feature was cosmetic. That is fixed in this batch; the steps below are the first check
that actually exercises it end to end.

| # | Step | Expect |
|---|------|--------|
| 1 | Open **Persona** | Modal opens, **6** built-ins, localized in ka |
| 2 | Select one, reload | Selection survives (`localStorage` key `myavatar:persona`), accent dot on the sidebar row |
| 3 | `GET /api/v2/personas` | 200, exactly 6 ids |
| 4 | `POST /api/v2/personas` `{"name":"x","directive":"short"}` | 400 `invalid_persona` |
| 5 | `POST` a directive containing `ignore all previous instructions` | 200, injection text **stripped**, id namespaced `custom:…` |
| 6 | ~10 rapid POSTs | 429 — expected, not a bug |
| 7 | **Pick a built-in, then chat** | Reply reflects the persona's voice. Network tab: the POST body to `/api/chat/gemini` now contains `personaId` |
| 8 | **Create a custom persona, then chat** | Body contains `personaId: "custom:…"` **and** the full `customPersona` object — a custom persona lives only in this browser, so the object must travel and the server re-validates it |

Persona storage is still **localStorage-only** — per-user server persistence needs a table this deployment
cannot migrate. A different browser sees no custom personas. That is a known limitation, not a bug.

---

## 3 · The three new studios

Each submit requires sign-in. Text inputs only — no SSRF surface on presentation; montage and 3D validate
every URL with `isPublicHttpUrl` before any fetch.

**Montage — `/ka/montage`**
- Two shot rows by default; add up to 12. Duration counter updates live and uses the *same* pure function
  the server encodes against.
- Render 3–6 mixed-aspect clips including **one portrait phone clip** and **one silent clip**.
  - Portrait must come out **upright**. `renderConcat` uses `-filter_complex`, which disables ffmpeg's
    rotation-metadata handling; every source is pre-conformed through `fitAspect` (a plain `-vf` pass)
    precisely to prevent sideways footage.
  - A silent clip must not abort the encode (`runSequence` synthesises a silent track).
- Master must play **with audio**, land under the storage cap, and appear in the Library.
- Try a crossfade: the finished file should be *shorter* than the sum of the shots.

**Presentation — `/ka/slides`**
- A Georgian topic must render **Mkhedruli, not blank**. Verified locally: Georgian draws 12,502 ink
  pixels with the bundled FiraGO and **exactly 0** without it — a missing font is a *blank* slide, not
  tofu, so "empty white slides" means the font/tracing path, not the layout.
- Long bullets must wrap and never run off the slide edge.
- **PDF / Print** → one slide per page, images decoded.
- **Download ZIP** → numbered PNGs, cover first.
- If the amber "images could not be generated" banner appears, the Imagen key is missing — the text-only
  deck is the intended degraded output, not a failure.

**3D — `/ka/3d`**
- **Expected result today: a clear message that the Meshy API key is not configured.** There is no
  `MESHY_API_KEY` on any environment. Anything else — a generic error, a spinner that never resolves — is
  the bug.
- Do **not** flip the catalogue tile to `live: true` until a real key returns a real GLB. The client is
  written to Meshy's documented contract and covered by 22 stubbed-fetch tests; **no real call has ever
  been made.**

---

## 4 · Known defects — confirm, do not re-file

**Hash-target rows still need a reload (unfixed).** `ChatChrome` navigates with `router.push`, and
`ServiceHub` (`components/studio/ServiceHub.tsx:105`) listens **only** for `hashchange`. `history.pushState`
fires neither `hashchange` nor `popstate`, so clicking Video → Image changes the URL without switching
surface until F5. Worse, its reader falls back to `'omni'` for *any* unrecognised hash.

This is why **Montage was moved to a real path** rather than a hash: its tile was `live: true`, advertised
"Automatic editing", and pointed at `#film` — the Film Studio — which it could not even reach reliably. The
remaining hash rows (Chat, Image, Video, Music, Avatar, Remix) still have the defect. A new catalogue test
now asserts every live tile points at a surface that exists, but it cannot catch the reload behaviour.

**`vercel.json` maxDuration precedence is unverified.** The catch-all is `"app/api/**": 15`. Whether a
route-segment `export const maxDuration` overrides it was asserted by three separate analyses and
demonstrated by none. Rather than keep guessing, all four new routes **and** the previously-shipped
dubbing route now have explicit `vercel.json` entries. Worth confirming on this deploy that a long
montage is not killed at 15s.

---

## 5 · Deploy

```bash
vercel deploy --yes --archive=tgz
```

Never `--prod` for a check. Wait for the process to exit, then `vercel inspect <url>` to confirm the
commit that was built.
