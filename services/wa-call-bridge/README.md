# wa-call-bridge

The media bridge for WhatsApp Business Calling (option A):
**caller's WhatsApp → Meta Calling (WebRTC, Opus) → this bridge → the app's Gemini Live session → Agent G**.

It is one Node process for many calls. It holds no Google key, no prompt, no prices and no rules. For each call our
app sends a signed offer with a short-lived ticket. Everything the bridge does next is a request back to the app on
that ticket: the SDP answer, a locked Gemini Live token, the caller's words, each tool call, the end. The call logic is
in the repo at `lib/calls/bridge/` (tested there); this folder only adds the WebRTC + Opus adapter and the process.

## Status

| Part | Label | Evidence |
|---|---|---|
| Call flow: answer, Live session, words before tools, tool relay, resume after goAway or a drop, wrap-up note, cap, media timeouts | BUILT_NOT_PROVEN (simulated) | `lib/calls/bridge/callBridge.test.ts`: real call service, bridge API and phone tools; Meta mocked, peer faked, Gemini scripted |
| 48↔16/24 kHz resampling, barge-in flush, metrics | BUILT_NOT_PROVEN (simulated) | `pcm.test.ts`, `playout.test.ts` |
| WebRTC (ICE, DTLS-SRTP, RTP) + Opus both ways | PROVEN locally only | `npm run loopback`: two real WebRTC peers in one process, see `docs/handoffs/omnichannel/evidence/` |
| Interop with Meta's real SDP and media servers | BUILT_NOT_PROVEN | needs a real call (owner's word) |
| Real Gemini Live on the phone setup, Georgian speech, real latency | BUILT_NOT_PROVEN | needs a funded call (owner's word) |

## Run locally

```bash
npm ci                 # werift 0.24.4, opusscript 0.1.1, esbuild 0.28.2 (pinned)
npm run typecheck
npm run loopback       # real WebRTC + Opus between two local peers; prints measurements, exits 1 on failure
npm run build && CALL_BRIDGE_SECRET=... APP_ORIGIN=https://myavatar.ge npm start
```

## Environment

| Name | Meaning |
|---|---|
| `CALL_BRIDGE_SECRET` | Shared with the app (≥ 32 characters). Never logged. Offers without its signature (±60 s) are refused. |
| `APP_ORIGIN` | The app's https origin. |
| `PORT` | Local HTTP port, default 8080, bound to 127.0.0.1. |
| `PUBLIC_IP` | The VM's public address, added as an ICE host candidate (cloud VMs sit behind 1:1 NAT). |
| `RTC_PORT_MIN` / `RTC_PORT_MAX` | UDP range for media, default 40000–40999. |
| `BRIDGE_MAX_CALLS` | Concurrent calls, default 4. `/health` answers 503 when full, and the app then tells the caller by text instead of ringing into a full bridge. |

## Hosting (NOT created; needs the owner's word: paid infrastructure)

Cloud Run cannot receive UDP, so the bridge needs a VM: one e2-small with a static IP (~$20.61 a month in
europe-west3, verified 2026-10-10). In front of the Node process, Caddy terminates TLS for `CALL_BRIDGE_URL`
(automatic certificates) and proxies to 127.0.0.1:8080. Firewall: TCP 443 from anywhere (the app calls it), UDP
40000–40999 from anywhere (Meta's media servers; Meta publishes no fixed range). Deploys send SIGTERM: the bridge stops
taking calls and exits when the running ones end.

## Sizing (measured locally, 2026-10-10, Xeon 2.1 GHz)

- Opus decode + encode + both resamplers: about 15 ms of CPU per call-second.
- With werift's SRTP and the rest of the stack, both peers together used about 117 ms per audio-second, so one bridge
  call is roughly 60 ms per second (6 % of a vCPU).
- An e2-small sustains about half a vCPU, so 4 concurrent calls (the default) keeps it under ~50 %. Raise
  `BRIDGE_MAX_CALLS` only after watching real calls.
