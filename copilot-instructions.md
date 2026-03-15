# Avatar G Frontend - Copilot Workspace Instructions

## 🎯 Project Overview

**Avatar G** is a production-ready Next.js 14 application featuring a unified AI workspace with neural pipeline integration. This is an AI-powered digital twin platform offering 13+ AI services with multi-modal generation capabilities, identity verification, and internationalization support.

---

## 📐 Architecture

### Core Technologies
- **Framework**: Next.js 14.2.0 with App Router
- **Language**: TypeScript 5.3.3
- **Styling**: Tailwind CSS 3.4.1
- **UI Components**: Radix UI (accessible primitives)
- **Icons**: Lucide React
- **Animations**: Framer Motion 11.18
- **3D Rendering**: Three.js + React Three Fiber
- **State Management**: Zustand 4.5.7
- **Internationalization**: next-intl 4.8.2
- **Backend**: Supabase (auth + database + SSR)
- **Storage**: AWS S3 + Cloudflare R2

### AI Services Integration
- **LLM Providers**: OpenAI, Gemini, Groq, DeepSeek, xAI, OpenRouter
- **Voice**: ElevenLabs (TTS/Voice cloning)
- **Image**: Stability AI, DALL-E
- **Video**: Runway ML
- **Music**: Replicate

---

## 📁 Directory Structure

### `/app` - Next.js App Router
The main application directory using App Router convention:

```
app/
├── api/                    # API route handlers
│   ├── chat/              # Multi-provider chat completions
│   ├── tts/               # Text-to-speech
│   ├── stt/               # Speech-to-text
│   ├── generate/          # AI generation endpoints
│   ├── image-generator/   # Image generation
│   ├── video-generator/   # Video generation
│   ├── gemini/            # Gemini LLM
│   ├── groq/              # Groq LLM
│   ├── deepseek/          # DeepSeek LLM
│   ├── xai/               # xAI LLM
│   └── openrouter/        # OpenRouter LLM
├── services/              # 13 service pages
│   ├── avatar-builder/
│   ├── voice-cloner/
│   ├── language-tutor/
│   ├── photo-studio/
│   ├── music-studio/
│   ├── media-production/
│   ├── code-studio/
│   ├── creative-writer/
│   ├── presentations/
│   ├── meeting-ai/
│   ├── executive-agent/
│   ├── finance-ai/
│   └── ar-vr-lab/
├── workspace/             # Main workspace interface
├── dashboard/             # User dashboard
├── onboarding/            # Onboarding flow
├── memory/                # Memory management
├── settings/              # User settings
├── about/                 # About page
├── pricing/               # Pricing page
├── contact/               # Contact page
├── layout.tsx             # Root layout
├── page.tsx               # Home page
├── error.tsx              # Error boundary
├── global-error.tsx       # Global error handler
├── loading.tsx            # Loading state
├── not-found.tsx          # 404 page
└── sitemap.ts             # Sitemap generation
```

### `/components` - React Components
Reusable UI and feature components:

```
components/
├── ui/                    # Base UI components (buttons, dialogs, etc.)
├── chat/                  # Chat interface components
├── sections/              # Page sections
├── shared/                # Shared utilities
├── three/                 # Three.js 3D scenes
├── ChatInterface.tsx
├── ControlPanel.tsx
├── ExecutiveHeader.tsx
├── GlobalChatbot.tsx
├── Header.tsx
├── Footer.tsx
├── Navigation.tsx
├── IdentityGuard.tsx
├── ImageGenerator.tsx
├── LanguageProvider.tsx
├── LanguageSwitcher.tsx
├── ServiceCard.tsx
├── ServiceOrbital.tsx
├── ServicePageShell.tsx
└── SpaceBackground.tsx
```

### `/lib` - Utilities & Integrations
Core utilities, contexts, and service integrations:

```
lib/
├── ai/                    # AI service clients
├── identity/              # Identity context & verification
├── i18n/                  # Internationalization utilities
├── storage/               # Storage clients (S3, R2)
├── supabase/              # Supabase clients (client/server)
├── config.ts              # App configuration
├── store.ts               # Zustand stores
├── utils.ts               # Utility functions
├── a11y.ts                # Accessibility utilities
└── performance.ts         # Performance monitoring
```

### `/hooks` - Custom React Hooks
```
hooks/
├── useFileUpload.ts       # File upload hook
└── useVoiceInput.ts       # Voice input hook
```

### `/store` - State Management
Zustand stores with persistence:
```
store/
└── identityStore.ts       # Identity state (avatar + voice biometrics)
```

### `/types` - TypeScript Definitions
```
types/
├── supabase.ts            # Supabase type definitions
└── speech.ts              # Speech API types
```

### `/messages` - i18n Translations
```
messages/
├── en.json                # English translations
└── ka.json                # Georgian translations
```

### `/e2e` - End-to-End Tests
Playwright E2E tests:
```
e2e/
├── home.spec.ts           # Home page tests
└── identity.spec.ts       # Identity flow tests
```

### `/__tests__` - Unit & Integration Tests
Jest tests:
```
__tests__/
├── components/            # Component tests
├── api/                   # API route tests
└── integration/           # Integration tests
```

### Service Configuration Directories
Placeholder directories for provider-specific configs:
- `/Azure` - Azure service configurations
- `/Gemini` - Google Gemini configurations
- `/OpenAI` - OpenAI configurations
- `/R2` - Cloudflare R2 configurations

---

## 🎨 Key Features

### 1. **13 AI Services**
Each service has dedicated UI, API routes, and specialized AI models:
- **Avatar Builder**: Digital twin creation with customizable styles
- **Voice Cloner**: Voice synthesis & cloning (ElevenLabs)
- **Language Tutor**: Interactive language learning
- **Photo Studio**: AI image generation & editing
- **Music Studio**: AI music composition (Replicate)
- **Media Production**: Video generation (Runway ML)
- **Code Studio**: Code generation & debugging
- **Creative Writer**: Content creation assistant
- **Presentations**: Slide deck generation
- **Meeting AI**: Meeting transcription & summarization
- **Executive Agent**: Business strategy assistant
- **Finance AI**: Financial analysis & projections
- **AR/VR Lab**: 3D/VR experience creation

### 2. **Identity System**
- Biometric identity verification (face + voice)
- Digital twin creation with avatar customization
- Identity persistence via Zustand with localStorage
- `IdentityContext` for app-wide identity state

### 3. **Neural Pipeline**
- Asset flow management between services
- Drag-and-drop interface for asset manipulation
- Cross-service data passing

### 4. **Unified Workspace**
- Single chat interface with contextual controls
- Service-specific toolbars and parameters
- Real-time AI responses with streaming

### 5. **Multi-Provider AI Fallback**
```
Primary: OpenAI GPT-4
  ↓ (if fails)
Fallback 1: Google Gemini
  ↓ (if fails)
Fallback 2: Groq (Llama 3)
```

### 6. **Internationalization (i18n)**
- Default locale: Georgian (`ka`)
- Supported locales: Georgian, English
- Language switcher in header
- Translation-ready component structure

### 7. **3D Scenes**
- Executive dashboard with Three.js
- Service orbital visualization
- 3D agent interactions

---

## 🔌 API Routes

### Chat & Language
- `POST /api/chat` - Multi-provider chat completions
- `POST /api/gemini` - Google Gemini chat
- `POST /api/groq` - Groq (Llama 3) chat
- `POST /api/deepseek` - DeepSeek chat
- `POST /api/xai` - xAI chat
- `POST /api/openrouter` - OpenRouter chat

### Speech
- `POST /api/tts` - Text-to-speech (ElevenLabs)
- `POST /api/stt` - Speech-to-text (OpenAI Whisper)

### Generation
- `POST /api/generate/image` - Image generation
- `POST /api/generate/video` - Video generation
- `POST /api/generate/music` - Music generation
- `POST /api/generate/voice` - Voice synthesis
- `POST /api/generate/text` - Text generation
- `POST /api/image-generator` - Advanced image generation
- `POST /api/video-generator` - Advanced video generation

---

## 🧪 Testing

### Jest Configuration
- **Environment**: jsdom (React testing)
- **Coverage Thresholds**: 70% (branches, functions, lines, statements)
- **Module Mapping**: `@/*` alias resolution
- **Setup**: `jest.setup.js` for global config

### Playwright Configuration
- **Browsers**: Chrome, Firefox, Safari, Mobile (Chrome, Safari)
- **Base URL**: `http://localhost:3000`
- **Reporters**: HTML (detailed report)
- **Retries**: 2 in CI environment
- **Screenshots**: On failure
- **Tests**: `/e2e/home.spec.ts`, `/e2e/identity.spec.ts`

### Running Tests
```bash
# Unit tests
npm test

# E2E tests
npx playwright test

# E2E tests with UI
npx playwright test --ui
```

---

## 🔐 Security & Middleware

### Middleware (`middleware.ts`)
- CORS headers configuration
- Security headers (X-Frame-Options, CSP)
- Rate limiting ready (free/premium tiers)
- Request logging and monitoring

### Environment Variables
See `.env.local.example` for required variables:
- Supabase credentials
- AI provider API keys (OpenAI, Gemini, etc.)
- Storage credentials (AWS S3, R2)
- ElevenLabs API key

---

## 🚀 Development Workflow

### Setup
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Build Configuration (`next.config.js`)
- ESLint ignored during builds (configurable)
- TypeScript errors ignored during builds (configurable)
- SWC minification enabled
- Optimized package imports for `lucide-react`

### Deployment
- Optimized for Vercel deployment
- Auto-deployment on push to main branch
- `.build-complete` marker for deployment status tracking
- Custom deployment scripts: `deploy.sh`, `setup.sh`

---

## 📝 Code Patterns

### 1. **Service Page Structure**
```typescript
// Standard service page layout
import ServicePageShell from '@/components/ServicePageShell'

export default function ServicePage() {
  return (
    <ServicePageShell
      title="Service Name"
      description="Service description"
    >
      {/* Service-specific content */}
    </ServicePageShell>
  )
}
```

### 2. **Identity Context Usage**
```typescript
import { useIdentity } from '@/lib/identity/IdentityContext'

function Component() {
  const { identity, setIdentity } = useIdentity()
  // Use identity state
}
```

### 3. **Internationalization**
```typescript
import { useTranslations } from 'next-intl'

function Component() {
  const t = useTranslations('ComponentName')
  return <h1>{t('title')}</h1>
}
```

### 4. **API Route Pattern**
```typescript
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Process request
    return NextResponse.json({ result })
  } catch (error) {
    return NextResponse.json({ error: 'Error message' }, { status: 500 })
  }
}
```

### 5. **Supabase Client Usage**
```typescript
// Client-side
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()

// Server-side
import { createClient } from '@/lib/supabase/server'
const supabase = createClient()
```

---

## 🎯 Key Configuration Files

- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `i18n.config.ts` - Internationalization configuration
- `jest.config.js` - Jest testing configuration
- `playwright.config.ts` - Playwright E2E configuration
- `postcss.config.js` - PostCSS configuration
- `middleware.ts` - Next.js middleware
- `navigation.ts` - Navigation configuration

---

## 🎨 Design System

### Theme
- **Style**: Premium Glassmorphism
- **Base**: Dark obsidian theme
- **Accents**: Silver and gradient highlights
- **Animations**: Framer Motion micro-interactions

### UI Components (`/components/ui`)
All UI components are built with:
- Radix UI primitives for accessibility
- Tailwind CSS for styling
- Framer Motion for animations
- TypeScript for type safety

---

## 📚 Additional Resources

### Important Files
- `README.md` - Project overview and setup guide
- `package.json` - Dependencies and scripts
- `.gitignore` - Git ignore rules
- `.npmrc` - npm configuration

### Deployment Scripts
- `deploy.sh` - Production deployment
- `setup.sh` - Initial setup
- `fixed-setup.sh` - Fixed setup script
- `full-rebuild.sh` - Complete rebuild
- Various test scripts (`test-*.sh`)

---

## 🔍 Important Notes

1. **Build Configuration**: The project currently ignores ESLint and TypeScript errors during builds. This is configurable in `next.config.js`.

2. **Path Aliases**: Use `@/` prefix for imports (e.g., `@/components/Header`).

3. **Error Handling**: The app has comprehensive error boundaries at both route and global levels.

4. **Performance**: SWC minification is enabled for optimal bundle size.

5. **Accessibility**: All UI components follow WCAG 2.1 AA standards using Radix UI primitives.

6. **Testing**: Both unit tests (Jest) and E2E tests (Playwright) are configured with coverage requirements.

7. **i18n Default**: The default language is Georgian (`ka`), with English as the secondary language.

---

## 🤝 Contributing Guidelines

When working on this project:

1. **Follow TypeScript**: Use strict typing, avoid `any`
2. **Test Coverage**: Maintain 70% coverage minimum
3. **Accessibility**: Ensure all components are keyboard-navigable
4. **Internationalization**: Add translations for both `en` and `ka`
5. **Error Handling**: Implement proper error boundaries and API error responses
6. **Documentation**: Update this file when adding new features or changing architecture

---

**Last Updated**: 2026-02-08
**Version**: 2.0.0
**Status**: Production Ready ✅
