# Agent Hierarchy — MyAvatar.ge

## Architecture

All agents operate under a **director-specialist** pattern.
**Agent G** is the single director. Every specialist and integration agent is a child of Agent G.

```
                          ┌─────────────┐
                          │   Agent G    │
                          │  (Director)  │
                          └──────┬───────┘
              ┌──────────────────┼──────────────────┐
              │                  │                   │
      ┌───────┴───────┐  ┌──────┴──────┐   ┌───────┴────────┐
      │  Specialists  │  │ Specialists │   │  Integrations  │
      │  (inner ring) │  │ (mid + outer│   │  (channels)    │
      └───────┬───────┘  │   rings)    │   └───────┬────────┘
              │           └──────┬──────┘           │
  ┌───────────┼──────────┐      │         ┌────────┼─────────┐
  │ Avatar    │ Workflow  │      │         │Telegram│WhatsApp │
  │ Builder   │ Builder   │      │         │  Bot   │ Webhook │
  │ Video St. │ Agent G   │      │         │Phone   │         │
  └───────────┼──────────┘      │         │ Call   │         │
              │                  │         └────────┴─────────┘
  ┌───────────┼──────────────────┤
  │ Media Prod│ Music Studio     │
  │ Photo St. │ Social Media Mgr │
  │ Visual Int│ Image Creator    │
  │ Text Intel│ Prompt Builder   │
  │ Online Sh │ Creative Engine  │
  │           │ Universal Editing│
  └───────────┴──────────────────┘
```

## The 18 Agents

### Director (1)
| ID | Name | Role |
|----|------|------|
| `agent-g` | Agent G | Routes all tasks, orchestrates multi-agent flows |

### Specialists (15)
| ID | Name | Description |
|----|------|-------------|
| `avatar-agent` | Avatar Builder | 3D avatar creation pipeline |
| `workflow-agent` | Workflow Builder | Chain automations |
| `video-agent` | Video Studio | Cinematic video generation |
| `media-agent` | Media Production | Campaign multimedia |
| `music-agent` | Music Studio | Music tracks & stems |
| `photo-agent` | Photo Studio | Editorial photo outputs |
| `social-agent` | Social Media Manager | Social content workflows |
| `visual-intel-agent` | Visual Intelligence | Visual asset analysis |
| `image-agent` | Image Creator | Image concept generation |
| `text-agent` | Text Intelligence | Strategic copy |
| `prompt-agent` | Prompt Builder | Reusable prompt systems |
| `shop-agent` | Online Shop | Commerce storefront |
| `creative-engine-agent` | Creative Engine | Games & interactive content |
| `editing-agent` | Universal Editing | CapCut-level video editing |

### Integrations (3)
| ID | Name | Channel |
|----|------|---------|
| `telegram-agent` | Telegram Integration | Telegram Bot API |
| `whatsapp-agent` | WhatsApp Integration | WhatsApp Business webhook |
| `call-agent` | Phone Call Agent | Twilio Voice |

## Communication Rule

```
⛔ STRICT: Specialist agents NEVER communicate with each other directly.
✅ ALL inter-agent communication MUST route through Agent G.

Flow: User → Agent G → Specialist → Agent G → User
Multi-agent: User → Agent G → [Specialist A, Specialist B] → Agent G → merge → User
```

This is enforced at the API level: `/api/agents/{agentId}/task` routes all go through the Agent G router middleware.

## New Agents (planned)

- **Creative Engine Agent** — generates games, interactive experiences, mini-apps
- **Universal Editing Agent** — CapCut-level: trim, transitions, effects, subtitles, color grade, audio sync
