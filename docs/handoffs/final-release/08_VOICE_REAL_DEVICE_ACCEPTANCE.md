# 08 — Voice real-device acceptance

Status: NOT_RUN. No real phone and no real Gemini Live session were used by this thread. What is proven is in the
simulated browser run (03, T-07) and the unit tests (04, T-09, T-17).

## Already true on the branch, whatever the device

- No paid start by voice: start_generation, agent_task start and extract_audio start answer `ui_confirmation_required`;
  OmniStudio's Live handler refuses a studio render (`components/studio/liveRunGate.test.ts`).
- Agent G's free montage, audio and edit plans still take a spoken yes, recorded on the run.
- Dictation does not auto-read the reply (`autoPlayReplyRef.current = false` at all 5 sites).
- Stopping read-aloud touches audio only, never a job (`lib/voice/experience/readAloud.test.ts:44`).
- Voice Experience v2 UI is behind `NEXT_PUBLIC_VOICE_EXPERIENCE_V2` (unset in Production): users keep the old read button.

## The real-device run (owner, after the release; nothing paid)

GG, signed in as admin on an iPhone (Safari) and on an Android phone (Chrome), at https://www.myavatar.ge/ka:

| Step | Action | Pass when |
|---|---|---|
| V-1 | Tap the microphone, dictate a question | the text appears; the reply is NOT read aloud on its own |
| V-2 | Tap the reply's read button | it is read; tapping stop stops the audio |
| V-3 | Start a Live call, ask for an image with a price | the price is said and shown; saying "კი" starts nothing |
| V-4 | Press the priced button on screen | only now does the job start (admin is never charged) |
| V-5 | During a running job, start dictation or stop read-aloud | the job keeps running |
| V-6 | Ask Agent G for a free montage of uploaded clips, say "კი" | the montage starts (free) |

Record per step: device, browser, time, pass/fail, and a screenshot without private content. Until then this item stays
NOT_RUN, and Voice v2 stays off for customers.
