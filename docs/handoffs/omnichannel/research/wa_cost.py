# Cost model for WhatsApp voice calls: A (Meta Calling -> our bridge -> Gemini Live) vs B (ElevenLabs Agents).
# Verified inputs: research/google-live-verification-2026-10-10.md and research/meta-verification-2026-10-10.md.
# Run: python3 docs/handoffs/omnichannel/research/wa_cost.py   (stdlib only; prints the tables used in
# docs/handoffs/omnichannel/COMMUNICATION_UNIT_ECONOMICS.md)
import math

# ---- Google Gemini Live (CONFIRMED 2026-10-10, list prices, USD per token) ----
TOK_S = 25                                    # audio tokens per second, in and out
AUDIO_IN, AUDIO_OUT = 3.00e-6, 12.00e-6       # both models
MODELS = {
    # name: (text in, text out = transcription surcharge)
    "2.5 native audio (phone default)": (0.50e-6, 2.00e-6),
    "3.8 Live": (0.75e-6, 4.50e-6),
}
# Input billed share. 3.8 bills the whole listening time (proactive audio always on). 2.5/3.1 bill what is streamed,
# and the bridge streams the caller's audio continuously (silence included), so both are billed for the whole call.
IN_SHARE = 1.0
USER_SHARE, AGENT_SHARE = 0.5, 0.4            # of call time
TURN_S = 20                                   # seconds per turn (10 user + 8 agent + 2 gap)
SYS = 4000      # system prompt + phone tools + memory, text tokens (measured 2026-10-10: ~2,600 without memory,
                # memory block at most 1,200 chars; Georgian counted 1 token per char)
TRANS_TOK_PER_SPEECH_MIN = 600                # transcription text tokens per minute of speech (Georgian, ESTIMATED 3x Google's ~175)
CAP = (8000, 4000)                            # PHONE_COMPRESSION (lib/calls/whatsapp/phoneSetup.ts)
CAP_ALT = (12000, 6000)                       # fallback if the first funded call shows 8k/4k forgets too fast
# Conservative: audio context is counted OUTSIDE the trigger (system text not subtracted), so more audio is re-billed.

# ---- Meta (Georgia +995) ----
META_USER_INITIATED = 0.0                     # "All user-initiated calls are free." CONFIRMED
META_BUSINESS_INITIATED = 0.0095              # $/min, 0-50k tier, 6 s pulses (rate card Apr 2026; not re-read 10-10)
META_SERVICE_MSG = 0.0212                     # after 1,000 free a month per number; counted on every call (worst case)
MSGS_PER_CALL = 1                             # the result / report after the call

# ---- Bridge VM (CONFIRMED SKU prices, europe-west3) ----
VM_MONTH = 15.76 + 3.65 + 1.20                # e2-small + static IPv4 + 10 GB balanced PD = 20.61
VM_MONTH_MEDIUM = 31.51 + 3.65 + 1.20         # e2-medium = 36.36
EGRESS_PER_MIN = 0.34 / 1000                  # realistic, worst-case classification of the Gemini leg
CALLS_PER_SMALL_VM = 4                        # BRIDGE_MAX_CALLS default (measured ~6 % of a vCPU per call on loopback)

# ---- Failure allowance: minutes the platform pays Google for but does not bill (dropped calls) ----
RETRY_SHARE = 0.05

# ---- Money (lib/credits/unitEconomics.ts ECON) ----
GEL_PER_USD, FX_RESERVE = 2.7, 0.05
NET_GEL_PER_CREDIT = (0.10 / 1.18) * 0.97     # a credit after 18 % VAT and the 3 % card fee
TARGET, FLOOR = 0.65, 0.62

# ---- B: ElevenLabs Agents (feasibility 5.1) ----
B_PER_MIN = 0.08 + 0.0029                     # agent minute + Gemini 2.5 Flash as its LLM
B_PLAN, B_INCLUDED = 22.0, 275                # Creator plan


def gemini(T_min, model, cap=CAP):
    """USD for one call of T_min minutes: (base audio, context re-bill, system re-bill, transcription)."""
    text_in, text_out = MODELS[model]
    T = T_min * 60
    base = IN_SHARE * T * TOK_S * AUDIO_IN + AGENT_SHARE * T * TOK_S * AUDIO_OUT
    n = int(T / TURN_S)
    per_turn = (USER_SHARE + AGENT_SHARE) * TURN_S * TOK_S   # 450 audio tokens join the context each turn
    ctx, rebill_tok = 0, 0
    for _ in range(n):
        rebill_tok += ctx
        ctx += per_turn
        if cap and ctx > cap[0]:
            ctx = cap[1]
    rebill = rebill_tok * AUDIO_IN
    sysc = n * SYS * text_in
    trans = (USER_SHARE + AGENT_SHARE) * T_min * TRANS_TOK_PER_SPEECH_MIN * text_out
    return base, rebill, sysc, trans


def call_cost(T_min, model, outbound=False, cap=CAP):
    """Variable USD of one call: Gemini (with the failure allowance), Meta, the result message, egress."""
    g = sum(gemini(T_min, model, cap)) * (1 + RETRY_SHARE)
    meta = (META_BUSINESS_INITIATED if outbound else META_USER_INITIATED) * T_min
    return g + meta + MSGS_PER_CALL * META_SERVICE_MSG + EGRESS_PER_MIN * T_min


gel = lambda usd: usd * GEL_PER_USD * (1 + FX_RESERVE)
credits_for = lambda cost_gel, m: math.ceil(cost_gel / (NET_GEL_PER_CREDIT * (1 - m)) - 1e-9)
margin = lambda credits, cost_gel: 1 - cost_gel / (credits * NET_GEL_PER_CREDIT)

LENGTHS = (5, 15, 30)
VOLUMES = (100, 500, 1000, 5000)
M = "2.5 native audio (phone default)"

if __name__ == "__main__":
    print("== 1. One call, Gemini only (USD) ==")
    for model in MODELS:
        for cap, label in ((None, "default compression"), (CAP, "8k/4k"), (CAP_ALT, "12k/6k")):
            row = []
            for T in LENGTHS:
                b, r, s, t = gemini(T, model, cap)
                row.append(f"{T} min ${b + r + s + t:.3f}")
            print(f"  {model:34s} {label:20s} " + " | ".join(row))
    b, r, s, t = gemini(1, M)
    print(f"  breakdown, 30 min, {M}, 8k/4k: " + ", ".join(f"{k} ${v:.3f}" for k, v in zip(("audio", "context re-bill", "system re-bill", "transcription"), gemini(30, M))))

    print("\n== 2. One call, all variable costs (USD), 2.5, 8k/4k and 12k/6k ==")
    for T in LENGTHS:
        for cap, label in ((CAP, "8k/4k"), (CAP_ALT, "12k/6k")):
            i, o = call_cost(T, M, False, cap), call_cost(T, M, True, cap)
            print(f"  {T:>2} min {label:7s} inbound ${i:.3f} (${i / T:.4f}/min) | outbound ${o:.3f} (${o / T:.4f}/min)")

    print("\n== 3. Per-minute price that clears the margin on variable cost alone (credits/min, worst length) ==")
    for cap, label in ((CAP, "8k/4k"), (CAP_ALT, "12k/6k")):
        for outbound in (False, True):
            worst = max(gel(call_cost(T, M, outbound, cap)) / T for T in (1, 2, 3, 5, 10, 15, 20, 30))
            print(f"  {label:7s} {'outbound' if outbound else 'inbound ':8s} worst {worst:.4f} GEL/min -> target {credits_for(worst, TARGET)} cr, floor {credits_for(worst, FLOOR)} cr")

    print("\n== 4. Month, all-in margin incl. the VM, at a flat price per started minute ==")
    print("     columns: call length (5/15/30 min) x direction (i = user calls, o = Agent G calls back)")
    for cap, label in ((CAP, "8k/4k (code today)"), (CAP_ALT, "12k/6k (fallback)")):
        for P in (10, 12):
            print(f"  -- {label}, {P} credits a minute ({P / 10:.2f} GEL) --")
            for V in VOLUMES:
                cells = []
                for T in LENGTHS:
                    calls = V / T
                    for outbound in (False, True):
                        cost = gel(calls * call_cost(T, M, outbound, cap) + VM_MONTH)
                        rev = V * P * NET_GEL_PER_CREDIT
                        cells.append(f"{T}m{'o' if outbound else 'i'} {100 * (1 - cost / rev):5.1f}%")
                print(f"  {V:>5} min/mo: " + "  ".join(cells))

    print("\n== 5. Volume from which the all-in margin clears the floor / target (worst length and direction) ==")
    for cap, label in ((CAP, "8k/4k"), (CAP_ALT, "12k/6k")):
        var = max(gel(call_cost(T, M, True, cap)) / T for T in LENGTHS)
        for P in (10, 12):
            rev = P * NET_GEL_PER_CREDIT
            out = []
            for m in (FLOOR, TARGET):
                head = rev * (1 - m) - var       # what each minute leaves for the VM at margin m
                out.append(f"{int(m * 100)}% from {gel(VM_MONTH) / head:,.0f} min/mo" if head > 0 else f"{int(m * 100)}% never")
            print(f"  {label:7s} {P} cr/min: " + " | ".join(out))

    print("\n== 5b. The SSoT op (lib/credits/unitEconomics.ts 'agent-g.whatsapp-call.minute') ==")
    g30 = sum(gemini(30, M, CAP)) / 30
    lines = {"gemini (30-min call, 8k/4k)": g30, "meta outbound": META_BUSINESS_INITIATED, "result message / 5-min call": META_SERVICE_MSG / 5,
             "vm at 1,000 min/mo": VM_MONTH / 1000, "egress": EGRESS_PER_MIN}
    usd = sum(lines.values()) * (1 + RETRY_SHARE)
    for k, v in lines.items():
        print(f"  {k:30s} ${v:.5f}")
    print(f"  full cost ${usd:.5f}/min = {gel(usd):.4f} GEL -> target {credits_for(gel(usd), TARGET)} cr, floor {credits_for(gel(usd), FLOOR)} cr; margin at 12 cr {100 * margin(12, gel(usd)):.1f}%")

    print("\n== 6. Month totals (USD), 15-min user-initiated calls: A (2.5 + VM) vs B (ElevenLabs Creator) ==")
    for V in VOLUMES:
        a = (V / 15) * call_cost(15, M, False, CAP) + VM_MONTH
        a2 = (V / 15) * call_cost(15, M, False, CAP_ALT) + VM_MONTH
        bb = B_PLAN + max(0, V - B_INCLUDED) * B_PER_MIN + (V / 15) * (META_SERVICE_MSG + 0.003)
        print(f"  {V:>5} min: A 8k/4k ${a:7.2f} (${a / V:.4f}/min) | A 12k/6k ${a2:7.2f} | B ${bb:7.2f} (${bb / V:.4f}/min)")

    print("\n== 7. Concurrency ==")
    for V in VOLUMES:
        day = V / 30
        peak_erlang = day * 0.15 / 60        # 15 % of a day's minutes in the busiest hour
        def erlang_b(E, N):
            inv = 1.0
            for k in range(1, N + 1):
                inv = 1 + inv * k / E
            return 1 / inv
        print(f"  {V:>5} min/mo: peak-hour load {peak_erlang:.2f} Erlang; P(5th simultaneous call refused on one e2-small) = {erlang_b(peak_erlang, CALLS_PER_SMALL_VM):.5f}")
    per_call_usd_min = call_cost(15, M, False, CAP_ALT) / 15
    print(f"  Gemini Tier 1 spend cap $10 / 10 min -> about {10 / (10 * per_call_usd_min):.0f} simultaneous calls at ${per_call_usd_min:.3f}/min each")
