# Communication unit economics: WhatsApp calls and messages

Last updated: 2026-10-10. Branch `claude/launch-certification-wmvitt`.

**This is a proposal for GG's one approval. Nothing here changes Production:** no price, balance, plan or payment setting.

- The price lives in the pricing SSoT, `lib/credits/unitEconomics.ts`:
  - op `agent-g.whatsapp-call.minute`;
  - `PROPOSED['agent-g.whatsapp-call.minute'] = 12`.
- It charges no one. `lib/calls/whatsapp/liveDeps.ts` keeps `APPROVED_CALL_CREDITS_PER_MINUTE = null`, so no call can start, and no charger is wired.

**Sources and checks:**
- **Calculator:** [`research/wa_cost.py`](research/wa_cost.py), stdlib Python. Run `python3 docs/handoffs/omnichannel/research/wa_cost.py`.
- **Verified inputs:**
  - [`research/google-live-verification-2026-10-10.md`](research/google-live-verification-2026-10-10.md)
  - [`research/meta-verification-2026-10-10.md`](research/meta-verification-2026-10-10.md)
- **Tests that hold the rule:** `lib/credits/unitEconomics.test.ts`, section "WhatsApp calls". The TypeScript model reproduces the calculator's numbers.

## 1. The rule

These are the owner's rules from 2026-10-10 12:42Z, unchanged.

- **Margins:** 65 % target gross margin, 62 % floor.
- **Cost** is the full cost in lari, measured against what a credit nets after 18 % VAT and the 3 % card fee: 0.0822 ₾ per credit.
  - FX is 2.70 ₾ per USD, plus a 5 % reserve.
  - credits = ceil(cost ₾ ÷ (0.0822 × (1 − margin))).
- **The bridge VM is a fixed cost.** GG asked to see it at low usage too, so every month table below includes it.

## 2. Inputs

| Input | Value | Label |
|---|---|---|
| Live audio | 25 tokens/s; $3 / 1M in, $12 / 1M out | CONFIRMED (Google, 2026-10-09/10) |
| Phone model | `gemini-2.5-flash-native-audio` (the only Live model verified in Georgian); text in $0.50, text out $2.00 / 1M | CONFIRMED price |
| Context re-billing | the whole context again every turn, at the audio input rate, no cache discount | CONFIRMED (Live API best practices, 2026-09-15) |
| Input billed share | 100 % of the call: the bridge streams the caller's audio, silence included | ESTIMATED (conservative; 2.5 bills what is streamed) |
| Talk shares, turn | caller 50 %, Agent G 40 %, 20 s turns | ESTIMATED (same as the feasibility report) |
| Instruction re-billed each turn | 4,000 text tokens | sized from MEASURED text: the phone instruction is 5,790 characters (671 Georgian) and the tools 1,934, about 2,600 tokens; memory adds up to 1,200 characters |
| Compression | 8,000 → 4,000 in code (`PHONE_COMPRESSION`); 12,000 → 6,000 as the fallback | the instruction counted OUTSIDE the cap: the conservative reading |
| Transcription surcharge | 600 text tokens per speech-minute at the text-out rate | ESTIMATED (Georgian at 3× Google's English figure) |
| Meta, user calls us | free | CONFIRMED |
| Meta, Agent G calls back | $0.0095 / min to Georgia, 0–50k min tier, 6 s pulses | rate card Apr 2026; not re-read today, and the calling page says "no change on Oct 1" |
| Meta, the result message after a call | $0.0212 (service message after the first 1,000 a month), counted on EVERY call | CONFIRMED rule; the GE value from the rate card |
| Bridge VM | e2-small $15.76 + static IP $3.65 + 10 GB disk $1.20 = **$20.61 / month** (58.43 ₾) | CONFIRMED (SKU list, Frankfurt) |
| Egress | $0.34 per 1,000 call-minutes | ESTIMATED (worst classification) |
| Dropped calls | 5 % of Google minutes not billable | ESTIMATED |
| B (ElevenLabs Agents) | $0.08 / min + $0.0029 / min LLM; Creator plan $22 / month with 275 min | from the feasibility report |

## 3. One call (USD)

Gemini only:

| Call | Default compression | **8k → 4k (code)** | 12k → 6k (fallback) |
|---|---|---|---|
| 5 min | 0.236 | **0.236** | 0.236 |
| 15 min | 1.618 | **0.958** | 1.211 |
| 30 min | 5.970 | **2.023** | 2.691 |

- A 30-minute call at 8k → 4k breaks down as:
  - audio $0.351;
  - **re-billed context $1.459**;
  - the instruction again each turn $0.180;
  - transcription $0.032.
- Without an explicit cap, a 30-minute call costs Google about 3× as much. **The cap is not optional.** A test pins it.

All variable costs: Gemini, Meta, the result message and egress.

| Call | 8k → 4k, user calls | 8k → 4k, Agent G calls back | 12k → 6k, user calls | 12k → 6k, calls back |
|---|---|---|---|---|
| 5 min | 0.270 | 0.318 | 0.270 | 0.318 |
| 15 min | 1.032 | 1.175 | 1.297 | 1.440 |
| 30 min | 2.155 | 2.440 | 2.857 | 3.142 |

## 4. The proposed price: 12 credits a minute (1.20 ₾)

The proposal:
- one price for both directions;
- charged per started minute;
- no free call minutes.

What a call would cost the customer, against what it costs us:

| Call | Customer pays | Our variable cost (₾, 8k → 4k, in / out) | Margin before the VM |
|---|---|---|---|
| 5 min | 60 credits = 6.00 ₾ | 0.77 / 0.90 | 84.5 % / 81.7 % |
| 15 min | 180 credits = 18.00 ₾ | 2.93 / 3.33 | 80.2 % / 77.5 % |
| 30 min | 360 credits = 36.00 ₾ | 6.11 / 6.92 | 79.4 % / 76.6 % |

**Why 12 and not less:**
- On variable cost alone, the code's setup needs 8 credits (user calls) or 9 (call-back) for 65 %.
- The VM is what moves the number: 58.43 ₾ a month whatever the volume.
- At 12, the SSoT op (the worst minute of today's setup with the VM spread over 1,000 minutes a month) is at 69.2 %. Its 65 % target price is 11.
- 12 also keeps the 12k → 6k fallback above the 62 % floor at 1,000 minutes a month in every case. A test pins this.

**All-in monthly margin, VM included, at 12 credits a minute.** Columns are call length × direction (in = the user calls, out = Agent G calls back).

| Minutes / month | 5 in | 5 out | 15 in | 15 out | 30 in | 30 out |
|---|---|---|---|---|---|---|
| **8k → 4k (code)** | | | | | | |
| 100 | 25.2 % | 22.5 % | 21.0 % | 18.3 % | 20.1 % | 17.4 % |
| 500 | 72.6 % | 69.9 % | 68.4 % | 65.6 % | 67.5 % | 64.8 % |
| 1,000 | 78.5 % | 75.8 % | 74.3 % | 71.6 % | 73.4 % | 70.7 % |
| 5,000 | 83.3 % | 80.5 % | 79.0 % | 76.3 % | 78.2 % | 75.4 % |
| **12k → 6k (fallback)** | | | | | | |
| 100 | 25.2 % | 22.5 % | 15.9 % | 13.2 % | 13.4 % | 10.7 % |
| 500 | 72.6 % | 69.9 % | 63.3 % | 60.6 % | 60.8 % | 58.1 % |
| 1,000 | 78.5 % | 75.8 % | 69.2 % | 66.5 % | 66.7 % | 64.0 % |
| 5,000 | 83.3 % | 80.5 % | 74.0 % | 71.2 % | 71.4 % | 68.7 % |

**Volume at which the all-in margin clears the rule, worst length and direction:**

| Setup | Price | 62 % floor from | 65 % target from |
|---|---|---|---|
| 8k → 4k | 12 cr | ~405 min / month | ~510 min / month |
| 12k → 6k | 12 cr | ~750 min / month | ~1,210 min / month |
| 8k → 4k | 10 cr (for comparison) | ~715 | ~1,025 |
| 12k → 6k | 10 cr | ~3,780 | never |

**Low usage, plainly:**
- At 100 call-minutes a month, no price near this one clears the floor. The VM's 58 ₾ is most of the cost. A test pins this warning.
- This is why the VM should be created only when GG decides to launch calls. It is not created today.
- WhatsApp text and media need no VM; they run on Vercel.

**What replaces these estimates:** the first funded calls.
- The bridge reports Google's own `usageMetadata` per call (prompt, response and total tokens, in `CallMetrics`).
- That settles three estimates with real numbers:
  - the 100 % input share;
  - whether the instruction counts inside the cap;
  - the Georgian transcript tokens.
- If the real cost per minute is lower, the price can come down in the same approval cycle. It is never raised silently.

## 5. A vs B

Month totals, 15-minute calls the user places (USD):

| Minutes / month | A, 8k → 4k + VM | A, 12k → 6k + VM | B (ElevenLabs Creator) |
|---|---|---|---|
| 100 | 27.49 | 29.26 | 22.16 |
| 500 | 55.02 | 63.85 | 41.46 |
| 1,000 | 89.43 | 107.10 | 83.72 |
| 5,000 | 364.69 | 453.05 | 421.77 |

**Honest reading:**
- B is a little cheaper below about 1,500 minutes a month, because it has no VM of ours.
- A is cheaper above that, on today's setup.
- The difference is a few dollars to tens of dollars a month. **Cost does not decide between them.**

**Recommendation: A**, on the grounds in [`PHONE_PROVIDER_FEASIBILITY.md`](PHONE_PROVIDER_FEASIBILITY.md) §6, which still hold:
1. One Agent G brain, as GG asked. B puts ElevenLabs' own agent loop in front of ours.
2. The number stays ours for messages, links and media.
3. Georgian runs on the model already verified.
4. Media reaches the agent.
5. Conversation data stays with Google's paid tier, not a second processor with 2-year default retention.

**B stays the documented fallback** if Meta's answer or the first funded call rules A out.

## 6. Concurrency

- **The bridge:**
  - `BRIDGE_MAX_CALLS` defaults to 4 per e2-small. Measured on loopback, one call takes ~6 % of a vCPU, so 4 leaves headroom.
  - A full bridge reports 503 on `/health` and refuses new offers as `busy`. It never rings and drops.
  - Expected peak load, with 15 % of a day's minutes in the busiest hour:

    | Minutes / month | Peak load | Chance a 5th simultaneous call is refused |
    |---|---|---|
    | 100 | 0.01 Erlang | ≈ 0 |
    | 500 | 0.04 Erlang | ≈ 0 |
    | 1,000 | 0.08 Erlang | ≈ 0 |
    | 5,000 | 0.42 Erlang | 0.08 % |

  - **One e2-small covers every scenario up to 5,000 minutes a month.** An e2-medium ($36.36 / month) is needed only well above that.
- **Google:**
  - Live concurrency on the Gemini API is not published (UNCONFIRMED).
  - The Tier 1 spend cap ($10 per 10 minutes) allows about 12 simultaneous calls at ~$0.086 / min.
  - Tier 2 ($50 per 10 min) after $100 spent.
  - Vertex allows 1,000 sessions per project.
- **Meta:** 1,000 or 5,000 concurrent calls; its own FAQ says both. Not binding at these volumes.

## 7. WhatsApp messages (text and files)

These are WhatsApp's own charges, on top of the AI cost already in the SSoT (`chat.message`).

- **Replies inside the 24-hour window:** free for the first 1,000 a month per number, then $0.0212 each to Georgia (since 2026-10-01).
  - A user's message, or a user's call, opens or refreshes that window.
- **Messages outside the window:** a "your video is ready" alert is a Utility template at $0.0212.
- **Sending a finished file is a message.** Media messages are priced like text.
- **Recommendation:** no separate price per message now. At today's volume the 1,000 free cover it.
  - When usage approaches 1,000 a month, count WhatsApp replies inside the existing free daily chat cap rather than adding a price. This is noted for the pricing approval, not built.

## 8. What is not decided here

| Item | Who decides | Notes |
|---|---|---|
| The price itself | GG, in the one pricing approval | Same card as the pricing audit |
| Creating the VM ($20.61 / month) | GG's separate word | |
| The first funded test calls | GG's separate word | Google + Meta usage, a few cents each |
| Meta's written answer on §4.7 | Meta | Until then calls stay off whatever the price ([`META_SUPPORT_REQUEST.md`](META_SUPPORT_REQUEST.md)) |
