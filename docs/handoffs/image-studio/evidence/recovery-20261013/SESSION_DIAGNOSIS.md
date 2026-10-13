# Image Studio stalled execution diagnosis

Recovery date: 2026-10-13, Asia/Tbilisi. Raw command timestamps are UTC.

## Worktree identity

- Chat cwd: `/Users/giorgikintsurashvili/avatar-g-frontend-v3/.claude/worktrees/beautiful-moser-50e6af`, detached HEAD `0b931eb77ade3d21d26d44c540b36a4e6a4dbd51`; only `.codex/` untracked at entry.
- Actual Image Studio worktree: `/Users/giorgikintsurashvili/.codex/worktrees/image-studio-v1/beautiful-moser-50e6af`.
- Actual branch: `codex/image-studio-v1`, HEAD `30be5a2d96495f67134cad34796ce724a744bd28`.
- Eight tracked modified files; 93 untracked regular files; one `node_modules` symlink at recovery entry. No code was missing from the original 88-file snapshot.

## Confirmed approval stall

Both older chats reported `active / waitingOnApproval`, not a running Jest process:

- `continue` — `01a12e74-3f68-7e31-900e-dff1459d9742`.
- `გააგრძელე წინა ჩათი` — `01a13101-529c-70a1-8197-5817e6322111`.

At initial process inspection, there were no Jest, Playwright, Next build/dev, or TypeScript test/build processes. Do not kill the shared Codex app-server or unrelated MCP runtimes to dismiss an approval prompt.

The original chat's last unresolved `functions.exec` requested a disposable Image/Video compatibility snapshot and a UI assertion adjustment via `require_escalated`. The continuation's last unresolved `functions.exec` first requested a source-patch `git apply --check` against Video Core PR #58 and an evidence write, followed sequentially by a full Jest invocation. Its Phase 5 browser command had already exited successfully (5 tests, 50.5 seconds); it was not still rendering.

Historical tool output explicitly records `Automatic approval review failed: You've hit your usage limit` and states that the command was not executed and the failure was not a finding that the action was unsafe. This explains the recorded review failures. The current `waitingOnApproval` flag confirms the approval stage, but by itself does not establish whether the current pending review is still caused by a usage limit.

No dedicated tool to interrupt another chat is exposed. The attempted Codex UI access was refused by the computer-use tool: `Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.` No alternate UI or private app API was used. The owner was asked to Stop both old chats. Recovery does not rewrite any of their application-code files. Their stopped state is still unconfirmed.

After the owner's continuation, a safe independent change was applied to the previously clean `components/studio/create/omniWiring.test.ts`: five stale assertions were aligned with the already-implemented workspace gating. This file is absent from both pending command write sets. Before applying, the branch, HEAD, clean target-file status, target SHA-256, and every one of the 101 preserved regular-file hashes were checked. The resulting file was verified byte-for-byte against the successfully tested validation snapshot. New recovery reports use unique filenames. No concurrent source write was observed or overwritten; this is not a claim that the old approvals were cancelled.

## Separate Jest teardown hang reproduced

The recovery API group finished **172 suites / 1,604 tests successfully in 6.545 seconds**, wrote JSON results, and then remained alive with `Jest did not exit one second after the test run has completed`. This is an open-handle teardown issue, distinct from the older approval stalls.

Only that recovery-owned process group (PID/PGID 75683) was sent SIGTERM after verifying its command. No code was deleted. The command result truthfully records signal exit -15, while `regression-api.json` records all assertions passing. Subsequent broad regression groups use `--forceExit` plus an independent hard deadline. This makes runs finite; it is not a claim that the underlying handle has been fixed. Focused Image Studio tests exited naturally without `--forceExit`.

The diagnostic retry (`regression-api-handles.log`) passed all 1,604 tests and reported four `Timeout` handles, all originating at **`lib/api/rate-limit.ts:62`**, the module-level `setInterval(() => memLimiter.cleanup(), 5 * 60 * 1000)`. The shared rate limiter was not changed under the Image Studio recovery. A separate cleanup fix can unref the Node timer or provide lifecycle disposal, with browser/type compatibility and rate-limit behavior preserved.

The first diagnostic attempt in this recovery was itself rejected before execution by automatic approval review because of a usage limit. After the owner's `continue`, the account tool reported `ordinaryUsageAllowed: true`; the exact diagnostic was retried through `require_escalated` and completed. No private API or permission workaround was used.

## Other execution issues

- A library batch initially failed with sandbox `EPERM` while opening a local WebSocket fixture. The same bounded batch was retried through the official `require_escalated` path and passed; no sandbox restriction was bypassed.
- A first generated PR patch lacked Git added/deleted mode headers and failed dry-run parsing (`dev/null`). Regeneration with mode headers passed. This was a recovery artifact formatting problem, not a source conflict.
- The host Python lacks `tarfile.extractall(filter=...)`; the validation snapshot script uses the system tar on the trusted local Git archive instead. It copies no `.git` directory or `.env` files.

## Preservation

`uncommitted-snapshot.tar.gz` and `manifest.json` preserve every current uncommitted regular file and the dependency symlink. `unstaged.patch`, `staged.patch`, and `git-status.txt` retain the Git state. The original backup was independently validated: all **88 SHA-256 hashes matched**, and its archive and manifest were copied as `original-88-snapshot.tar.gz` and `original-88-manifest.json`.

Two old failed-browser artifacts had already been removed from the current tree by previous browser runs (`error-context.md` and `trace.zip`). Both are still present in the verified original archive. Recovery does not overwrite the newer successful browser evidence to restore obsolete failure outputs.

All new test output goes to this recovery directory with unique stage names. New Playwright output uses its own evidence directory. Hash drift checks protect against silently testing a moving source tree.
