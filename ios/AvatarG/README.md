# Avatar G – iOS App

**AI Creative Studio with Gemini Live-style Georgian Voice Agent**

> "Create Anything, in Georgian, by Speaking Naturally with AI."

---

## Features

- **Agent G Live** — Real-time conversational AI with true Georgian (`ka-GE`) speech-to-text (Mkhedruli script, zero romanization), live conversation mode with animated orb
- **AI Music Studio** — Full-track generation, multi-stem editor (vocals/drums/bass/melody/harmony/fx), AI mastering chain, MP3/WAV/Stems export
- **Avatar Builder** — AI avatars from photos, HeyGen-powered talking photos
- **Image & Video** — AI image generation, video generation
- **Unified Gallery** — All creations filterable by type, iCloud sync ready
- **3-Language UI** — Georgian / English / Russian throughout

---

## Requirements

- Xcode 15+
- iOS 17+ (physical device for Georgian STT)
- macOS 14+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

---

## Setup

```bash
# 1. Install XcodeGen
brew install xcodegen

# 2. Generate Xcode project
cd ios/AvatarG
xcodegen generate

# 3. Open in Xcode
open AvatarG.xcodeproj

# 4. Set your Apple Developer Team ID in:
#    AvatarG target → Signing & Capabilities → Team

# 5. Run on device (iPhone 12+, iOS 17+)
```

> **Georgian Speech Recognition** requires a physical device. The iOS simulator does not support `ka-GE` locale speech recognition. The app falls back to `en-US` on simulator with an informational banner.

---

## Architecture

```
MVVM-Clean + SwiftUI

AvatarG/
├── App/
│   ├── AvatarGApp.swift        — Entry point, environment injection
│   ├── ContentView.swift       — TabView root navigation
│   └── AppState.swift          — App-wide @Observable state
├── Core/
│   ├── Models/
│   │   └── Models.swift        — All data types (User, ChatMessage, MusicTrack, Stem…)
│   ├── Network/
│   │   ├── APIClient.swift     — Async/await REST client
│   │   ├── WebSocketService.swift — Real-time WebSocket for live conversation
│   │   └── Endpoints.swift     — API endpoint definitions
│   └── Services/
│       ├── SpeechService.swift — Georgian STT (ka-GE) + TTS via AVSpeechSynthesizer
│       ├── AgentGAPIService.swift — Agent G streaming API (SSE)
│       └── MusicAPIService.swift  — Music generation + stem editing
├── Features/
│   ├── Home/HomeView.swift     — Personalized greeting, quick prompts
│   ├── AgentGChat/
│   │   ├── AgentGChatView.swift     — Main chat UI (text + voice input)
│   │   ├── LiveConversationView.swift — Gemini Live-style full-screen orb
│   │   └── AgentGViewModel.swift    — All Agent G state + actions
│   ├── MusicStudio/
│   │   ├── MusicStudioView.swift    — Generate + track list
│   │   ├── StemEditorView.swift     — Multi-track stem editor
│   │   └── MusicStudioViewModel.swift
│   ├── Gallery/GalleryView.swift    — Unified content gallery
│   └── Profile/ProfileView.swift   — User, credits, settings
└── DesignSystem/
    ├── DesignSystem.swift      — Colors, fonts, spacing, animations
    └── Components.swift        — GlowButton, GlassCard, WaveformView, OrbView…
```

---

## Key Technical Details

### Georgian Speech-to-Text
```swift
// SpeechService uses ka-GE locale — produces native Mkhedruli script
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ka-GE"))
// Falls back to en-US if Georgian unavailable on device
// Multi-language detection: confidence threshold 0.6
```

### Agent G Live Conversation
```swift
// WebSocket: wss://myavatar.ge/ws/agent
// Interruptible — user speech cancels agent TTS mid-sentence
// OrbView reacts: .idle → .listening → .speaking states
```

### Music Generation Flow
```swift
// 1. POST /api/music/generate → returns trackId + status: .generating
// 2. Poll GET /api/music/status/{id} every 3s until status: .ready
// 3. stems[].audioURL available for individual playback
// 4. PATCH stem volume/mute → real-time mix preview
// 5. POST /api/music/master → returns final mastered URL
```

---

## Backend Integration

All requests go to `https://myavatar.ge/api`. Bearer token auth via Supabase session.

See [Endpoints.swift](AvatarG/Core/Network/Endpoints.swift) for full API surface.

---

## App Store Submission Notes

- Age Rating: **12+** (AI-generated content)
- Privacy labels: Microphone (voice input), Speech Recognition (Georgian STT), Photos (avatar creation)
- Content Safety: All AI outputs pass through safety filter before display
- Voice Cloning: Explicit consent flow required (GDPR/App Store guideline 1.4.1)
