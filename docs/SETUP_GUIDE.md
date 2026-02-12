# Avatar G Platform - Complete Setup Guide

## Phase 1: Environment Setup

### Prerequisites
- Node.js 18+
- npm or pnpm
- Supabase account (https://supabase.com)
- Docker (optional, for local Supabase)

### 1.1 Local Development Setup

```bash
# Install dependencies
npm install

# Create .env.local file with:
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Mock mode (optional - set to true to use mock providers)
NEXT_PUBLIC_MOCK_MODE=true

# Real provider keys (optional - remove MOCK_MODE to use real services)
REPLICATE_API_TOKEN=<your-replicate-token>
STABILITY_API_KEY=<your-stability-key>
ELEVEN_LABS_API_KEY=<your-eleven-labs-key>
RUNWAY_API_KEY=<your-runway-key>

# Database
DATABASE_URL=<your-supabase-connection-string>
```

### 1.2 Supabase Setup

#### Create Tables (SQL Migration)
Run the SQL migration file at `/supabase/migrations/001_core_tables.sql` in your Supabase SQL editor:

```sql
-- Copy entire contents from supabase/migrations/001_core_tables.sql
-- Paste into Supabase Dashboard > SQL Editor
-- Execute
```

#### Create Storage Buckets
In Supabase Dashboard > Storage:

1. **avatar-previews** (Public)
   - For avatar preview images
   - Allow public read, authenticated upload/delete

2. **voice-samples** (Private)
   - For voice training samples
   - Allow authenticated read/write/delete

3. **generated-audio** (Public)
   - For generated music tracks
   - Allow public read, authenticated upload/delete

4. **covers** (Public)
   - For album cover art
   - Allow public read, authenticated upload/delete

5. **generated-video** (Public)
   - For generated videos
   - Allow public read, authenticated upload/delete

6. **source-images** (Private)
   - For user-uploaded source images
   - Allow authenticated read/write/delete

7. **media-assets** (Public)
   - For user media library
   - Allow public read, authenticated upload/write/delete

#### Enable RLS (Row Level Security)
All tables already have RLS policies in the migration. Verify they're active:

```sql
-- Check RLS status
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

## Phase 2: Provider Setup

### Option A: Mock Mode (Recommended for Development)

Set `NEXT_PUBLIC_MOCK_MODE=true` in `.env.local`

**Benefits:**
- No API costs
- Instant generation (10-20 second delays for realistic feel)
- Full feature testing
- Perfect for UI development

**Limitations:**
- Generated content is fake/placeholder
- Cannot train real voices
- Cannot integrate with real audio/video

### Option B: Real Providers

#### Setup Replicate (Music + Video)
1. Create account at https://replicate.com
2. Get API token from Settings > API
3. Add to `.env.local`: `REPLICATE_API_TOKEN=<token>`

#### Setup Stability AI (Avatar Generation)
1. Create account at https://stability.ai
2. Get API key from account settings
3. Add to `.env.local`: `STABILITY_API_KEY=<key>`

#### Setup ElevenLabs (Voice Synthesis)
1. Create account at https://elevenlabs.io
2. Get API key
3. Add to `.env.local`: `ELEVEN_LABS_API_KEY=<key>`

#### Setup Runway (Advanced Video)
1. Create account at https://runwayml.com
2. Get API key from settings
3. Add to `.env.local`: `RUNWAY_API_KEY=<key>`

## Phase 3: Application Configuration

### 3.1 Language & Localization

Default language is Georgian (ka). Other supported languages: English (en), Russian (ru)

Update default in `/store/useStudioStore.ts`:
```typescript
language: 'ka', // or 'en' or 'ru'
```

### 3.2 Feature Flags

Update `/lib/config.ts`:
```typescript
export const FEATURES = {
  AVATAR_BUILDER: true,
  MUSIC_STUDIO: true,
  VIDEO_STUDIO: true,
  REELS_BUILDER: true,
  VOICE_TRAINING: true,
  LIVE_CAPTURE: false, // Requires camera/mic setup
  MULTIPLAYER: false,   // Coming soon
  PLUGINS: false,       // Coming soon
};
```

## Phase 4: Local Development

### Start Dev Server
```bash
npm run dev
```

Visit http://localhost:3000

### Services Available
- **Avatar Builder**: /services/avatar-builder
- **Music Studio**: /services/music-studio
- **Video Studio**: /services/media-production
- **Dashboard**: /dashboard

### Navigation
- Use **Studio Bar** at top to navigate between services
- Keep track of selected Avatar → Track → Video throughout workflow

## Phase 5: Testing Checklist

### Avatar Builder Testing
```
✓ Generate avatar from text prompt
✓ Customize style, appearance, clothing
✓ Save avatar to database
✓ View saved avatars in "My Avatars"
✓ Select avatar → shows in Studio Bar
✓ Upload photo for live scan (UI only in mock mode)
✓ Generate speech with custom text (mock audio)
```

### Music Studio Testing
**Create Song:**
```
✓ Enter song prompt in Georgian
✓ Select genre, mood, tempo
✓ Toggle lyrics mode (auto/custom/instrumental)
✓ For custom lyrics: type and save
✓ Click "Generate Song" → creates job
✓ Watch progress bar 0→100%
✓ After 10-15 seconds: track appears with cover + waveform
✓ View in library with all metadata
```

**Library:**
```
✓ Filter by favorites/recent
✓ Search songs by title/genre
✓ Download audio file
✓ Click "Use in Video" → shows in Studio Bar
```

**Remix/Extend:**
```
✓ Click remix on existing track (not implemented yet - scaffold ready)
✓ Click extend on existing track (not implemented yet - scaffold ready)
```

### Video Studio Testing
**Create Video:**
```
✓ Select avatar from dropdown (populated from saved avatars)
✓ Select track from dropdown (populated from generated songs)
✓ Choose camera template, lighting, resolution
✓ Enable/disable lip sync and lyrics
✓ Click "Generate Video" → creates job
✓ Watch progress 0→100% (15-30 seconds)
✓ After rendering: video appears with thumbnail
✓ Download video file
```

**Reels Wizard:**
```
✓ Select platform preset (TikTok/Instagram/YouTube)
✓ Choose template (Business/Cinematic/Minimal/Noir)
✓ Upload assets (logo, images)
✓ Use songtrack from music studio
✓ Generate reel automatically
✓ View results formatted for platform
```

### Cross-Service Workflow Testing

**Complete Flow:**
```
1. Avatar Builder
   ✓ Generate avatar
   ✓ Save to database
   ✓ → Shows in Studio Bar

2. Music Studio
   ✓ Select avatar from dropdown
   ✓ Generate song with Georgian prompt
   ✓ Save track to database
   ✓ → Shows in Studio Bar

3. Video Studio
   ✓ Avatar and track already selected
   ✓ Add camera/lighting options
   ✓ Generate video
   ✓ → Shows in Studio Bar

4. Share/Download
   ✓ Download final video
   ✓ Share to social media (UI ready)
```

### Localization Testing

**Georgian (ka):**
```
✓ All UI labels in Georgian
✓ Default language on first visit
✓ Persists in localStorage
✓ Georgian music templates available
```

**English (en):**
```
✓ Switch language in settings
✓ All labels translate correctly
✓ Save selection across services
```

**Russian (ru):**
```
✓ Switch language in settings
✓ All labels translate correctly
✓ Save selection across services
```

## Phase 6: Database Operations

### View Data
```sql
-- Check saved avatars
SELECT id, user_id, title, created_at FROM avatars LIMIT 10;

-- Check generated tracks
SELECT id, user_id, title, status, progress FROM tracks LIMIT 10;

-- Check video clips
SELECT id, user_id, title, status, progress FROM video_clips LIMIT 10;

-- Check jobs
SELECT id, user_id, type, status, progress FROM jobs ORDER BY created_at DESC LIMIT 20;
```

### Clear Test Data
```sql
-- Delete all user data (WARNING: use in dev only!)
DELETE FROM jobs WHERE user_id = '<user-id>';
DELETE FROM video_clips WHERE user_id = '<user-id>';
DELETE FROM tracks WHERE user_id = '<user-id>';
DELETE FROM avatars WHERE user_id = '<user-id>';
```

## Phase 7: Production Deployment

### Vercel Setup

1. **Connect GitHub Repository**
   ```
   Settings > Git > Connect GitHub repo
   ```

2. **Environment Variables**
   ```
   Add all .env.local variables to Production Environment
   ```

3. **Build Settings**
   ```
   Framework: Next.js
   Build Command: npm run build
   Output Directory: .next
   ```

4. **Deploy**
   ```
   Push to main branch → Automatic deployment
   ```

### Supabase Production

1. **Create production project** separately from development
2. **Run migrations** on production database
3. **Configure Auth Redirect URLs**
   ```
   Authentication > URL Configuration
   Add: https://yourdomain.com/auth/callback
   ```
4. **Update environment variables** to point to production Supabase
5. **Set up CORS** for storage buckets

### Domain & SSL

1. Buy domain from registrar
2. Point DNS to Vercel nameservers
3. Enable SSL in Vercel settings (automatic with custom domain)

## Phase 8: Monitoring & Maintenance

### Performance Metrics
- First Contentful Paint (FCP): Target < 1.5s
- Largest Contentful Paint (LCP): Target < 2.5s
- API Response Time: Target < 500ms
- Job Processing Time: Video 15-30s, Music 10-15s

### Logging
```typescript
// Check browser console for client errors
// Check Supabase Logs for database/auth errors
// Check Vercel Logs for API errors
```

### Rate Limiting
Per user, per hour:
- Avatar generation: 10 requests
- Music generation: 20 requests
- Video generation: 5 requests
- Voice training: 3 requests

### Backup Strategy
- Supabase auto-backups: daily
- Storage backups: weekly to S3
- Database dumps: weekly

## FAQ & Troubleshooting

### Q: Generation takes too long
**A:** Check Supabase job logs. Increase timeouts in API routes if needed.

### Q: Avatar not showing in Music Studio
**A:** Refresh page. Verify avatar was successfully saved in database.

### Q: Images not uploading
**A:** Check storage bucket permissions. Verify CORS settings in Supabase.

### Q: Can't generate content
**A:** Ensure auth token is valid. Check API routes returning errors. Pull console logs.

### Q: Mock mode not working
**A:** Set `NEXT_PUBLIC_MOCK_MODE=true` and restart dev server.

## Support

- Documentation: Check `/docs` folder
- API Status: Supabase dashboard
- Issues: Create GitHub issues
- Community: Discussion board (coming soon)
