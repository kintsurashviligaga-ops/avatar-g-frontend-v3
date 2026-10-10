# Cost model for WhatsApp voice calls: A (Gemini Live bridge) vs B (ElevenLabs Agents)
TOK_S = 25            # audio tokens per second (Google)
IN_AUDIO = 3.00/1e6   # $/token Live audio in (3.8 Live and 2.5 native audio)
OUT_AUDIO = 12.00/1e6 # $/token Live audio out
IN_TEXT = 0.75/1e6    # $/token Live text in (3.8 Live); 2.5 native audio = 0.50
SYS = 3000            # assumed system prompt + tool declarations, text tokens
TURN_S = 20           # assumed seconds per turn (10 s user + 8 s agent + 2 s gap)
META_BI = 0.0095      # $/min business-initiated call to Georgia (list tier)
VM_MONTH = 15.76 + 3.65  # e2-small europe-west3 + static IPv4 (approx)
MIN_MONTH = 1000
def gemini(T_min, cap=None):
    T = T_min*60
    user_s, agent_s = 0.5*T, 0.4*T
    base = user_s*TOK_S*IN_AUDIO + agent_s*TOK_S*OUT_AUDIO
    n = int(T/TURN_S)
    per_turn = (0.5+0.4)*TURN_S*TOK_S   # 450 audio tokens added to context per turn
    ctx, rebill_tok = 0, 0
    trig, targ = cap if cap else (None, None)
    for k in range(n):
        rebill_tok += ctx           # prior turns re-billed as input
        ctx += per_turn
        if trig and ctx > trig: ctx = targ
    rebill = rebill_tok*IN_AUDIO
    sysc = n*SYS*IN_TEXT            # system prompt re-billed each turn
    return base, rebill, sysc, rebill_tok
vm = VM_MONTH/MIN_MONTH
print(f"VM per minute at {MIN_MONTH} min/month: ${vm:.4f}")
for T in (5,15,30):
    b,r,s,rt = gemini(T)
    _,rc,_,rct = gemini(T,(16000,8000))
    _,rc2,_,rct2 = gemini(T,(8000,4000))
    metab = META_BI*T
    bridge = vm*T
    A_lo = b + bridge
    A_full = b + r + s + bridge
    A_cap = b + rc + s + bridge
    A_cap2 = b + rc2 + s + bridge
    Bel = 0.08*T + 0.0029*T
    print(f"{T:>2} min | Gemini base ${b:.4f} | rebill full ${r:.4f} ({rt} tok) | rebill cap16k ${rc:.4f} | cap8k ${rc2:.4f} | sys ${s:.4f} | bridge ${bridge:.4f}")
    print(f"       A no-rebill ${A_lo:.3f} | A full ${A_full:.3f} | A cap16k ${A_cap:.3f} | A cap8k ${A_cap2:.3f} | +Meta BI ${metab:.4f} | B ${Bel:.3f} (+Meta BI)")
print("\nMonthly at 1,000 call-min (all calls same length):")
for T in (5,15,30):
    calls = MIN_MONTH/T
    b,r,s,_ = gemini(T); _,rc2,_,_ = gemini(T,(8000,4000))
    A_noreb = calls*b + VM_MONTH
    A_full = calls*(b+r+s) + VM_MONTH
    A_cap = calls*(b+rc2+s) + VM_MONTH
    B = 22 + max(0, MIN_MONTH-275)*0.08 + MIN_MONTH*0.0029
    print(f"{T:>2}-min calls ({calls:.0f}) | A no-rebill ${A_noreb:.2f} | A full ${A_full:.2f} | A cap8k ${A_cap:.2f} | B Creator ${B:.2f} | Meta BI +${META_BI*MIN_MONTH:.2f} if business-initiated")
