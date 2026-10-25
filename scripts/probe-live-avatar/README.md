# Live avatar probe (test only, never merged)

Finds out what Vertex Gemini 3.8 Live sends for a talking avatar: which avatar names open, where `avatarConfig` sits,
the video format (container, codecs, size), timing and token use. Paid: about $0.4 per minute of avatar speech.

```
cd scripts/probe-live-avatar && npm i --no-save ws@8
export TOKEN=$(gcloud auth print-access-token)
SHAPE=a node run.mjs names          # setup only, no turn: free. Repeat with SHAPE=b and SHAPE=c if nothing opens.
SHAPE=a node run.mjs talk Kira      # one short Georgian turn, ~25 s, writes out-Kira.mp4 and report-Kira.json
LOCATION=us-central1 node run.mjs setup    # the app's exact avatar setups (setups.json), closed at setupComplete: free
LOCATION=us-central1 node run.mjs custom   # own-face avatar with a grey test image (no face): allowlisted or not
LOCATION=us-central1 FIXTURE=full node run.mjs talk Kira   # PAID (~$0.1): the app's exact setup, one Georgian turn, captions
```
