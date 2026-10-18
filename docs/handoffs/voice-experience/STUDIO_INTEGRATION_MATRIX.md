# Studio integration / ownership
| Surface | Result | Evidence / remaining action |
|---|---|---|
| One Window voice settings | PASS simulated | ChatChrome settings, KA/EN/RU persistence, mobile layout |
| Existing native call host | PASS mocked | Hook/host Jest; production GeminiLiveConversation untouched |
| Voice quote/status / open studio | PASS simulated | Existing browser flow retains quote/card path |
| Voice paid start | PASS simulated | Spoken yes denied; explicit UI create path covered |
| Music PR65 shared files | SOURCE COMPATIBLE proposal | Pinned 9d25c7a40716617fe71940bc6fc0befc23ff0c1b; patch apply-check 0 |
| Image60 / Video64 actual runtime | BLOCKED | Independent branches not combined; no runtime equivalence claim |
| Dictation never auto-reads in shared chat | BLOCKED integration | Protected OmniStudio still legacy; patch disables assignments |
| Full/selected read-aloud host | PARTIAL | Reader/component tests PASS; full reader mounting proposed, selection extraction pending |
| Real quote → credits → provider → Library | BLOCKED | Needs isolated backend/provider acceptance and explicit spending approval |
| Native interruption leaves jobs running | PASS hook boundary only | Local interruption flushes playback, does not dispatch job cancellation; real durable job scenario pending |
Do not modify Music PR65, Image60 or Video64 branches from this mission. Shared files are reserved by the owner. Review patches in a separately authorized integration branch, retain each Studio registry, run its tests and then perform actual UI/server E2E. Source apply checks never substitute for runtime evidence.

## Disposable combined-tree verification
Pinned Voice 54f570b2 + Music 9d25c7a4 + Image be9edee3 + Video bcb724a1 combine without source conflicts. No branch refs were changed. TypeScript exit 0; 64 Jest suites / 1,135 tests pass; 2 suites / 9 PostgreSQL tests skipped because the disposable environment has no database. These are the Image 3 and Music 6 database cases, not successful live runs.
The protected adapter patch also applies to this combined disposable tree and TypeScript exits 0 after applying it. No change was made to the Voice working tree's protected files or to Claude's branch. Runtime E2E of the combined product remains BLOCKED; compilation is not proof of it. See evidence/integration.json and integration logs.
