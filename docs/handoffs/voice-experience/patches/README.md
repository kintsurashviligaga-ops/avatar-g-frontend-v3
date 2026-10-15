# Protected-file integration proposal

Pinned Music PR #65: `9d25c7a40716617fe71940bc6fc0befc23ff0c1b`. These files are **not modified in the Voice working tree**.

`music-65-voice-adapter.patch` adds explicit full-read controls and stops dictation-triggered full reading; adds a second spend guard at the shared dispatcher. Existing Music declarations, cards and status/quote paths remain intact.

Apply-check against exact pinned files: exit 0. This is source compatibility, not runtime integration evidence.

Owner of shared files must review/apply this patch in an integration branch, then run TypeScript, shared chat/Music tests and browser read-aloud scenarios. Rebase the patch if PR #65 changes. Do not blindly apply to main. Current Voice branch does NOT mount the new reader into OmniStudio: this acceptance item is BLOCKED on shared-file ownership.

Selected-text reading is supported by the reader component via `selectedText`; selection extraction in the shared chat host remains to be integrated and tested. Legacy shared prompt strings still describe spoken approval; update them to UI confirmation when integrating, retaining all studio declarations.
