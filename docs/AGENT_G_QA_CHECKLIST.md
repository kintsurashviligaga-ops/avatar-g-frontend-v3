# Agent G QA Checklist

## Core Orchestration
- [ ] Open `/en/services/agent-g` and verify chat + Advanced Mode toggle render.
- [ ] Submit a high-level goal (e.g. `Build business plan + 10 social posts + voiceover`).
- [ ] Verify plan is created and execution timeline appears.
- [ ] Verify partial failures do not crash UI; timeline still updates.

## API Surface
- [ ] `POST /api/agent-g/plan` returns structured `plan`.
- [ ] `POST /api/agent-g/execute` returns `task_id`, status, and aggregated results.
- [ ] `POST /api/agent-g/delegate` returns sub-agent output.
- [ ] `GET /api/agent-g/status` returns task/subtask status.
- [ ] `GET /api/agent-g/output?task_id=...` returns output.
- [ ] `GET /api/agent-g/output?task_id=...&format=pdf` downloads PDF.
- [ ] `GET /api/agent-g/output?task_id=...&format=zip` downloads ZIP bundle.

## Channels
- [ ] `GET /api/agent-g/channels` returns runtime channel status.
- [ ] `POST /api/agent-g/webhook/telegram` validates webhook secret when configured.
- [ ] `GET /api/agent-g/webhook/whatsapp` verify handshake works with `hub.*` params.

## Dashboard / Settings
- [ ] `/en/services/agent-g/dashboard` lists tasks with status badges.
- [ ] `/en/services/agent-g/settings` shows runtime statuses and saved channel configs.
- [ ] Locale aliases work for `/ka/services/agent-g`, `/dashboard`, `/settings`.

## Workspace Integration
- [ ] Workspace shows Agent G tasks panel for authenticated users.
- [ ] Workspace context banner appears with `?from=agent-g&task=...`.
- [ ] Agent G prefill works with `/services/agent-g?prefill_goal=...`.

## Safety / Demo
- [ ] Logged-out user can execute in demo mode.
- [ ] Demo mode hides download links and shows explanatory note.
- [ ] Logged-in mode provides downloadable output endpoints.
