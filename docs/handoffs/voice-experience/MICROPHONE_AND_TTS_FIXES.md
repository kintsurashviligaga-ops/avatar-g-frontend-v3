# Stage B — microphone and speech fixes
Baseline: TypeScript PASS;39 existing suites/895 tests PASS. No live network/hardware.
Before fixes:3 failures/11 passes (duplicate gesture prime, late TTS after Stop, out-of-order TTS).
After fixes:14/14 pass. Preserve the first pending mic/context on a double tap. Fence and abort pending TTS, bound to30s; release blob URLs and stop on microphone takeover.
Explicit reader: full/selected source retained, no summary substitution; pause/resume/speed/stop; chunk failure is visible, never skipped; live call blocks duplicate reader; cleanup fences stale synthesis.9 reader tests PASS.
Dictation auto-read bug is in contested OmniStudio; integration patch will turn automatic speech OFF and mount the reader. Until applied, that product path is BLOCKED, not fixed in the shared host.
Existing micAcquire, gesture priming, Web Audio, transcription buffer, VAD and resumption are reused. Real first-syllable retention, Bluetooth and iOS require hardware verification.
