# Avatar Builder Platform - Technical Architecture

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Next.js)                         │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Avatar Builder│  │  Voice Lab   │  │  Talking Avatar   │  │
│  │    Wizard UI   │  │     UI       │  │      Panel        │  │
│  └────────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│           │                  │                     │              │
│           └──────────────────┼─────────────────────┘              │
│                              │                                    │
│                     ┌────────▼────────┐                          │
│                     │  LanguageContext │                          │
│                     │   (i18n KA/EN/RU)│                          │
│                     └───────────────────┘                         │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   API Routes     │
                    │  (Next.js Edge)  │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐      ┌─────▼──────┐
   │Supabase │         │ Provider  │      │  Job Queue │
   │   DB    │         │  Factory  │      │  (Async)   │
   └─────────┘         └─────┬─────┘      └────────────┘
                             │
               ┌─────────────┼──────────────┐
               │             │              │
        ┌──────▼──────┐ ┌───▼────┐  ┌─────▼──────┐
        │  Stability  │ │Replicate│  │    Mock    │
        │     AI      │ │         │  │  Provider  │
        └─────────────┘ └─────────┘  └────────────┘
```

---

## 📐 Frontend Architecture

### Component Hierarchy

```
app/
├── layout.tsx (LanguageProvider wrapper)
├── services/
│   └── avatar-builder/
│       └── page.tsx (Main Avatar Builder UI)
│
components/
├── Navigation.tsx (Multi-language selector)
├── services/
│   ├── ChatInterface.tsx (Prompt input)
│   ├── AvatarBuilderWizard/ (New wizard components)
│   │   ├── StepIdentity.tsx
│   │   ├── StepDesign.tsx
│   │   ├── StepWardrobe.tsx
│   │   ├── StepVoice.tsx
│   │   └── StepLive.tsx
│   ├── VoiceLab.tsx
│   ├── TalkingAvatarPanel.tsx
│   └── LiveCreatorMode.tsx
│
lib/
└── i18n/
    └── LanguageContext.tsx (Translation provider)
```

### State Management Strategy

**Multi-language State:**
- Provider: React Context (`LanguageContext`)
- Persistence: localStorage (`avatar-g-language`)
- Auto-detection: Browser `navigator.language`
- Scope: Global (all pages)

**Avatar Builder State:**
- Initial: React `useState` in page component
- Future: Zustand store for complex workflows
- Persistence: Database presets + localStorage drafts

**Job Polling:**
- Pattern: `setInterval` with exponential backoff
- Cleanup: `useEffect` cleanup on unmount
- Status: Real-time via Supabase Realtime (optional enhancement)

---

## 🔌 Backend Architecture

### API Routes Pattern

**Authentication Flow:**
```typescript
1. Client sends request with cookies
2. API route creates Supabase client
3. Check session via supabase.auth.getSession()
4. If no session → 401 Unauthorized
5. If session → proceed with userId
```

**Job-Based Pattern (Async Operations):**
```typescript
1. Client POSTs request
2. API creates DB record (status: queued)
3. API creates job record
4. API returns job_id immediately (202 Accepted)
5. Server processes async (background)
6. Client polls GET /api/jobs/:id for status
7. When complete, job.output contains result
```

**Synchronous Pattern (Quick Operations):**
```typescript
1. Client POSTs request
2. API processes immediately
3. API returns result (200 OK)
```

### Provider Adapter Pattern

**Interface-Based Design:**
```typescript
interface IAvatarProvider {
  name: string;
  generate(input): Promise<Result>;
  isAvailable(): boolean;
}
```

**Factory Selection Logic:**
- Check available API keys in env
- Priority: Stability > Replicate > Mock
- Mock mode: Always available, returns placeholders
- Runtime switching: Not supported (decided at startup)

**Benefits:**
- Swap providers without changing API routes
- Easy to add new providers
- Testable with mock providers
- Consistent error handling

---

## 🗄️ Database Schema Design

### Core Entities

**avatars** (Main avatar records)
- Stores generation params + output URLs
- Status tracking (queued/processing/completed/failed)
- Progress field (0-100)
- Relations: One user → Many avatars

**wardrobe_items** (Clothing/accessories)
- User uploads + stock items (is_stock flag)
- Categorized (top, bottom, shoes, etc.)
- Relations: One user → Many items

**voice_profiles** (Voice cloning slots A/B/C)
- Unique constraint: (user_id, slot)
- Consent tracking (required!)
- Training status + model reference
- Relations: One user → Up to 3 voices

**talk_clips** (Generated speech clips)
- Links to avatar (optional)
- Links to voice slot
- Audio + optional video URLs
- Relations: Many clips → One avatar, One voice

**jobs** (Universal async job tracker)
- Polymorphic: type field determines related record
- Status + progress tracking
- Input/output JSON storage
- Retry count for failure recovery

**presets** (User-saved configurations)
- Stores complete avatar config as JSON
- Categorized + tagged for filtering
- Use count tracking

**live_sessions** (Live creator mode tracking)
- Session duration + stats
- Character switch count
- Relations: One session → One avatar, One voice

### Row Level Security (RLS)

**Policy Pattern:**
```sql
-- Read: User can only see their own records
CREATE POLICY "select_own" ON table_name
FOR SELECT USING (auth.uid() = user_id);

-- Write: User can only insert their own records
CREATE POLICY "insert_own" ON table_name
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update/Delete: User can only modify their own records
CREATE POLICY "update_own" ON table_name
FOR UPDATE USING (auth.uid() = user_id);
```

**Stock Items Exception:**
```sql
-- Wardrobe: Users can see stock items
FOR SELECT USING (auth.uid() = user_id OR is_stock = true);
```

---

## 🔐 Security Architecture

### API Key Protection

**NEVER on Client:**
- All API keys in env vars
- Only server-side code can access
- Never sent in API responses

**server-only Package:**
```typescript
import 'server-only'; // Ensures file never bundles to client
```

### Authentication

**Supabase Auth:**
- JWT tokens in HTTP-only cookies
- Session managed by Supabase middleware
- RLS enforces data access per user

**API Route Protection:**
```typescript
const supabase = createRouteHandlerClient();
const { data: { session } } = await supabase.auth.getSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

### Input Validation

**Pattern:**
```typescript
if (!body.prompt || body.prompt.trim().length === 0) {
  return NextResponse.json({ error: 'Invalid input', code: 'INVALID_INPUT' }, { status: 400 });
}
```

**Validate:**
- Required fields present
- Data types correct
- Enum values valid
- File sizes within limits
- MIME types allowed

### Storage Security

**Upload Policies:**
- Users can only upload to their own folder: `{userId}/filename`
- Bucket policies enforce folder-based access
- Private buckets (voices) require signed URLs

**Public vs Private:**
- Public: avatars, wardrobe, talk-clips (shareable content)
- Private: voices (sensitive voice samples)

---

## 🌐 Multi-Language Architecture

### Translation System

**Structure:**
```typescript
{
  ka: { "key": "value_georgian" },
  en: { "key": "value_english" },
  ru: { "key": "value_russian" }
}
```

**Lookup Function:**
```typescript
const t = (key: string) => translations[language][key] || key;
```

**Fallback Strategy:**
1. Try current language
2. If missing → return key itself (visual indicator)
3. Dev mode: Log missing keys to console

### Browser Detection

**Logic:**
```typescript
const browserLang = navigator.language.toLowerCase();
if (browserLang.startsWith("ka")) return "ka";
if (browserLang.startsWith("ru")) return "ru";
return "en"; // default
```

**Persistence:**
- On mount: Check localStorage first
- If empty: Detect browser language
- On change: Save to localStorage
- SSR-safe: No localStorage access during server render

### Component Pattern

**Usage:**
```tsx
import { useLanguage } from '@/lib/i18n/LanguageContext';

function Component() {
  const { language, setLanguage, t } = useLanguage();
  
  return (
    <div>
      <p>{t("avatar.label.age")}</p>
      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="ka">ქართული</option>
        <option value="en">English</option>
        <option value="ru">Русский</option>
      </select>
    </div>
  );
}
```

---

## 🎨 UI/UX Architecture

### Design System

**Color Palette:**
- Primary: Avatar G brand colors (dark blue, neon accents)
- Dark mode: Default (dark backgrounds, light text)
- Glass morphism: Frosted panels with backdrop blur

**Typography:**
- Headings: Large, bold, readable
- Body: Inter/System font, 16px base
- Labels: 14px, medium weight
- Hints: 12px, gray, italic

**Spacing:**
- Base unit: 4px
- Component padding: 16px (4 units)
- Section gaps: 24px (6 units)
- Page margins: 32px (8 units)

### Responsive Strategy

**Breakpoints:**
- Mobile: < 768px (single column)
- Tablet: 768px - 1024px (2 columns)
- Desktop: > 1024px (3 columns, sidebar)

**Mobile-First:**
- Design for mobile first
- Enhance for larger screens
- Touch targets: Minimum 44x44px
- Swipe gestures for gallery

### Loading States

**Pattern:**
- Skeleton screens for initial load
- Progress bars for generation
- Spinners for quick actions
- Optimistic updates where safe

**Example:**
```tsx
{isLoading ? <Skeleton /> : <Content />}
{isGenerating && <ProgressBar value={progress} />}
```

---

## 📊 Data Flow Examples

### Avatar Generation Flow

```
1. User clicks "Create Avatar"
   ↓
2. Frontend POSTs to /api/avatar/generate
   ↓
3. API creates avatar record (status: queued)
   ↓
4. API creates job record
   ↓
5. API returns job_id (202 Accepted)
   ↓
6. Frontend starts polling /api/jobs/:id
   ↓
7. Backend async: Provider generates image
   ↓
8. Backend uploads image to Supabase Storage
   ↓
9. Backend updates avatar record (status: completed, image_url)
   ↓
10. Poll returns: status=completed, output={avatar}
   ↓
11. Frontend displays avatar in gallery
```

### Voice Training Flow

```
1. User uploads voice samples
   ↓
2. Frontend uploads files to Supabase Storage
   ↓
3. Frontend POSTs to /api/voice/upload (with URLs)
   ↓
4. API creates voice_profile record (status: pending)
   ↓
5. User clicks "Train Voice"
   ↓
6. Frontend POSTs to /api/voice/train
   ↓
7. API creates job record
   ↓
8. Backend async: Provider trains voice model
   ↓
9. Backend updates voice_profile (status: ready, model_ref)
   ↓
10. Poll returns: status=completed
   ↓
11. User can now use voice for talking avatars
```

### Talking Avatar Flow

```
1. User types text + selects voice
   ↓
2. Frontend POSTs to /api/avatar/talk
   ↓
3. API creates talk_clip record (status: queued)
   ↓
4. Backend async:
   a. Voice provider → Generate audio
   b. Upload audio to Storage
   c. (Optional) Talking provider → Generate lip-sync video
   d. Update talk_clip (audio_url, video_url)
   ↓
5. Poll returns: status=completed, output={clip}
   ↓
6. Frontend plays audio/video
```

---

## 🚀 Performance Optimizations

### Image Optimization

- Next.js `<Image>` component for automatic optimization
- Lazy loading for gallery images
- WebP format with JPEG fallback
- Responsive srcSet for different screen sizes

### Code Splitting

- Route-based: Automatic with Next.js App Router
- Component-based: `dynamic()` for heavy components
- Lazy load: Voice Lab, Talking Avatar, Live Mode

### Caching Strategy

- Static assets: CDN with long cache headers
- API responses: short-lived cache for job status
- Images: Supabase Storage CDN
- Database queries: Supabase connection pooling

### Edge Functions

- API routes use `export const runtime = 'edge';`
- Lower latency vs serverless functions
- Global deployment

---

## 🧪 Testing Strategy

### Unit Tests

- Provider adapters: Mock API responses
- Utility functions: Pure function tests
- Translation: Key coverage tests

### Integration Tests

- API routes: Request/response validation
- Database: CRUD operations
- Storage: Upload/download flows

### E2E Tests

- User flows: Sign up → Generate → Download
- Multi-device: Desktop, tablet, mobile
- Multi-browser: Chrome, Safari, Firefox

### Manual QA Checklist

See DEPLOYMENT_GUIDE.md Step 6

---

## 📈 Scalability Considerations

### Current Limitations

- Sync generation: API route waits for provider
- Single server: No distributed processing
- Job polling: Client-side interval

### Future Enhancements

**Background Workers:**
- Move generation to separate worker service
- Use message queue (BullMQ, Inngest)
- Scale workers independently

**Realtime Updates:**
- Use Supabase Realtime for job status
- WebSocket connection for live updates
- Eliminate polling overhead

**CDN & Caching:**
- CloudFlare for static assets
- Redis for job status cache
- API response caching (short TTL)

**Database Optimizations:**
- Indexes on frequently queried fields (already done)
- Partitioning for large tables (future)
- Read replicas for heavy read workloads

---

## 🔄 Feature Flags & Rollout Strategy

### MVP (Current Implementation)

- ✅ Multi-language UI (KA/EN/RU)
- ✅ Avatar generation (Stability/Replicate)
- ✅ Gallery management
- ✅ Preset system
- ✅ Mock mode for testing

### Phase 2 (Voice & Talking)

- Voice Lab UI
- Voice training API
- Talking avatar generation
- Audio player controls

### Phase 3 (Live Mode)

- WebRTC camera/mic access
- Face tracking (browser-based)
- Real-time avatar driving
- Character switching

### Feature Toggle Pattern

```typescript
const FEATURES = {
  VOICE_LAB: process.env.NEXT_PUBLIC_ENABLE_VOICE === 'true',
  LIVE_MODE: process.env.NEXT_PUBLIC_ENABLE_LIVE === 'true',
  WARDROBE_DRAG: false // Not yet implemented
};

{FEATURES.VOICE_LAB && <VoiceLabPanel />}
```

---

## 📚 Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 | React framework with App Router |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Animation | Framer Motion | UI animations |
| Database | Supabase (Postgres) | Data storage + auth |
| Storage | Supabase Storage | File uploads |
| Auth | Supabase Auth | User authentication |
| AI (Avatar) | Stability AI / Replicate | Image generation |
| AI (Voice) | Mock (ElevenLabs future) | Voice cloning |
| AI (Talking) | Mock (D-ID future) | Lip sync |
| State | React Context + Zustand | Global state |
| i18n | Custom Context | Multi-language |
| Deployment | Vercel | Edge hosting |

---

## 🎯 Architecture Principles

1. **Security First:** No API keys on client, RLS on all tables
2. **Provider Agnostic:** Easy to swap AI providers
3. **User-Centric:** Multi-language, clear feedback, mobile-friendly
4. **Scalable:** Async jobs, edge functions, storage CDN
5. **Maintainable:** TypeScript, clear separation of concerns
6. **Testable:** Mock providers, isolated components
7. **Observable:** Logging, error tracking, user analytics ready

---

**Document Version:** 1.0.0  
**Last Updated:** February 2026  
**Maintained By:** Avatar G Development Team

