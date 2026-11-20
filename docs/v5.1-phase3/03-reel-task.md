# Reel Task: „Gemini Tasks"-style work in Agent G

GG asked for this on 2026-11-20. GG sent an analysis PDF, "Gemini Tasks-ის ანალიზი და myavatar.ge-ში დამატების გეგმა", and asked that it be checked, analysed and added properly.

This document does three things:
1. It checks every claim in the PDF against Google's pages and against our code.
2. It records what we already had.
3. It describes what this PR adds and what wiring is still needed.

Status: draft. The flag `AGENT_REEL_TASK` is off by default. The work is stacked on the engine draft #308, which is not wired yet. It makes no paid calls and has no DB migration.

## 1. The PDF's claims, checked

| # | Claim in the PDF | Verdict | Evidence |
|---|---|---|---|
| 1 | Google has a "Tasks" mode in the Gemini app that runs multi-step work: Workspace, Connected Apps, websites, and a remote browser. | **True** | Google help page "Manage your tasks & workflows in Gemini Apps" (support.google.com/gemini/answer/17094507). Tasks was formerly the "Spark" beta. It is a Task toggle next to the prompt. It can use Connected Apps (Gmail, Calendar, Drive, Docs, Sheets and others), signed-in websites, Chrome auto browse on desktop, or a cloud remote browser. |
| 2 | It is Google's own consumer product, not something we can embed with an iframe or a script. | **True** | The page describes only the Gemini app, the Mac app and gemini.google.com. It names no developer API or embed. It requires a personal Google account (not work or school) and age 18+. Outside a few free countries it needs Google AI Pro or Ultra, and it is not offered in the EEA, UK, Switzerland or Nigeria. |
| 3 | Gemini asks before critical actions and hands control back (pause / take over). | **True** | Gemini always asks before it sends, deletes, shares sensitive data, buys, submits forms or signs in. You can stop it from the side panel or with the Stop button. "Take over task" opens the remote browser view. |
| 4 | Our own agent should use Function Calling: the model picks a declared function, the app validates the call and runs it. | **True, and it is how Agent G already works** | `lib/agent/tools/declarations.ts` and `registry.ts` hold the whitelisted tool declarations. `lib/agent/approval.ts` holds the approvals. The server checks every argument again. |
| 5 | Computer Use only where there is no API. It needs a screenshot → action loop, a sandbox and safety confirmations. | **True, already built that way** | #387 (browser agent v2, Gemini Computer Use grid on a Vercel Sandbox, flag off). The cloud browser is admin-only (D-08). GG decided "no Chrome extension, ever" on 2026-11-20. |
| 6 | Don't give the model generic tools (`run_any_api_request`, `execute_sql`, `spend_credits`). | **True, already true** | No such tool exists in the registry. Credits move only through `lib/credits` quote → reserve → settle, inside each route. |
| 7 | Long jobs need a queue and workers, not one HTTP request. Progress via SSE or polling. | **Already exists** | Lease queue `generation_jobs` (#258 and earlier). SSE timeline `/api/tasks/stream` (#272, #275). |
| 8 | MVP = "one prompt → finished Georgian Reel". | **Missing until this PR** | Agent G's media runs (`lib/agent/run/runSpec.ts`) take only `audio_extract`, `montage` and `edit`. The work-mode Task Graph (#279) takes only `browser`, `code`, `pdf` and `export`. Nothing chained script → frame → clip → voice → music → montage under one approval. |
| 9 | The privacy policy must say what the agent sees, what needs consent, and how long task history is kept. | **Needs GG**: legal text, proposed in §5 | The current page lists Google, Vertex, Drive and avatar processing. It has no "Agent mode" paragraph. |
| 10 | The PDF needs the repo, the API list and the billing path. | Already settled | Repo kintsurashviligaga-ops/avatar-g-frontend-v3, Vertex-only (D-05), credits ledger. |

One correction to the PDF. It says to pick "the Gemini API with a server-side API key **or** Vertex AI". MyAvatar is **Vertex-only** (D-05, Master v3.1). So the planner and the script writer run on Vertex `gemini-3.8-flash` through the existing server client, and no API key is used.

## 2. What already existed (map to the PDF's architecture)

| PDF section | Where it lives |
|---|---|
| Task UI: step list, states, clock, ✓ | `components/agent/AutoTaskCard` (#282), AgentTaskCard timeline (#272, #275) |
| Orchestrator: plan → validate → quote → approve → execute | `lib/agent/engine` (#308 plan / validate / scheduler), 3.5a VALIDATE (#309), 3.5b media bridge + pause (#310), 3.5c work-mode (#311). All drafts, not wired. |
| Whitelisted tools, strict validation | `lib/agent/tools/registry.ts`, `runSpec.validateRunSpec`, engine `parsePlan` |
| Explicit confirmation before paid work | quote → approve (`lib/agent/approval.ts`), engine `admitQuote` + StepHold (a higher quote waits for a yes) |
| Idempotent debit | `lib/orchestrator/idemRef`, ledger reserve/refund under one ref, engine refund (#383) |
| Limits on steps, time, retries and credits | engine `MAX_STEPS`, 30 min media deadline, 1 retry, run ceiling (VALIDATE) |
| Pause / Resume / Cancel | engine commands. Pause on media runs (#310). |
| Prompt text never becomes system instruction | injection shield #384 (flag off), fenced "data, not instructions" planner prompt |
| Untrusted web content kept apart from actions | browser runs are quote-once, results go to the workspace, site agent asks before ✦/delete/send (#285) |
| Connectors with OAuth, minimal scope, consent | Drive (drive.file, PKCE, sealed refresh token), #390 reconnect states. Gmail/Calendar wait for Google verification. |
| Short signed URLs | storage signers (media renew #331) |

## 3. What this PR adds

`lib/agent/engine/reel.ts` contains pure code, 30 tests in `reel.test.ts`, and the engine's full suite (89 tests) is green.

- **`isReelAsk` and `understandReel`**: Georgian, English and Russian. Asks back at most two questions:
  - what the Reel is about, when there is no subject and no photo;
  - whether a character should speak in the clip or a narrator should be laid over it, when "ხმა" is ambiguous.
  
  Every other choice gets a default that the confirmation card states:
  - 8 s, 9:16, 720p;
  - a drawn first frame when there is no photo;
  - music on.
  
  A 10 s ask with no spoken line is held to Veo's 8 s, and the card says so.
- **`reelPlan`**: a **fixed template**, not a free model plan. The user's words go only into the script step, as data. No prompt can add a tool, a link or a step. Prompt-injection text cannot change the price (a test pins this).

  ```
  script (write, ✦0)
    ├─ frame (image)            only without a photo
    ├─ voice (speech, ✦0)       only for a narrator
    └─ music (Lyria)            beside the clip
  clip (Veo; Omni Flash when a character speaks Georgian, GG 2026-10-26)
  reel (montage 9:16 [+ captions], ✦0)  ← clip, voice, music
  save (Library, ✦0)
  ```
  Each price comes from `lib/credits` (`quoteCredits`, `omniClipCredits`), the same functions the routes charge with. The confirmation shows one total before anything runs, and each step is held to its approved price.
- **`reelPanel`**: the task panel model the PDF asks for:
  - each step's label and state (დაგეგმილი / მუშაობს / დასრულდა / საჭიროებს დადასტურებას / ჩავარდა / გამოტოვდა / გაჩერდა);
  - approved vs charged credits;
  - which of Pause / Resume / Cancel / Retry / Alternative are live;
  - a plain sentence about the step that failed.
- **`retryOf`**: the next run carries the finished run's checkpoints, so done steps (the clip, the voice) are **not rendered or paid twice**.
- **`alternativeOf`**: an honest cheaper path. Drop the music or the voice-over, or render the clip on Veo without the spoken line when Omni is down. When the script itself failed it returns none.
- **Engine**: `montage` is a new engine tool and counts as a media tool, so the run gets the 30 min deadline.
- **Flag**: `AGENT_REEL_TASK` = off | admins | everyone, default off.

## 4. Wiring that is still needed (each step needs GG's OK)

1. Merge the engine stack: #308 → #309 (VALIDATE) → #310 (media bridge) → this PR. This needs Supabase back, per GG's rule.
2. Write the executors for `write` (reel_script on Vertex 3.8 flash), `image`, `video`, `music`, `speech` and `montage`. Each one calls the existing route's server function. No new provider is involved.
3. Captions: the `montage` executor refuses `captions: true` until the Smart Editor caption pass (#365) is in prod. Until then, VALIDATE reports it as `capability_unavailable`.
4. Router: `isReelAsk` → the Reel card, behind `reelTaskOpen`. That means Router v2 (#381) or the OmniStudio send path.
5. UI: render `reelPanel` in AutoTaskCard, using the existing timeline and buttons.
6. Paid E2E on a Production deployment: one 8 s 720p Reel with a photo. The approximate price is the sum of clip + music from the price book. This needs GG's budget OK.
7. The privacy text (§5) goes live before the flag opens to everyone.

## 5. Proposed privacy-policy paragraph (needs GG's approval, not applied)

> **Agent G დავალებები.** როცა Agent G-ს დავალებას აძლევთ (მაგ. „შემიქმენი Reel“), ის ხედავს მხოლოდ თქვენს მიერ გამოგზავნილ ტექსტს და ფაილებს. ის ქმნის გეგმას და ფასს გაჩვენებთ, სანამ რაიმე კრედიტი ჩამოიჭრება. ტექსტი და ფაილები მუშავდება Google Vertex AI-ში (ევროკავშირის ან აშშ-ის რეგიონი) მხოლოდ ამ დავალების შესასრულებლად. დავალების ისტორია და ნაბიჯების ჩანაწერი ინახება თქვენს ანგარიშში, სანამ არ წაშლით. ფასიანი ნაბიჯი, ფაილის გაგზავნა ან გამოქვეყნება ყოველთვის თქვენს დადასტურებას საჭიროებს. დავალების გაჩერება ან წაშლა ნებისმიერ დროს შეგიძლიათ.

## 6. Deliberately not done (agrees with the PDF)

- Embedding Google's Tasks UI: impossible (no API), and it would also hand pricing and data isolation to Google.
- A free browser for every user: the browser stays admin-only (D-08), and there is no extension (GG decision of 2026-11-20).
- Gmail, Calendar, social publishing and phone calls: each is its own connector, built only after OAuth, consent, audit and Google verification.
