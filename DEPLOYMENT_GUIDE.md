# Avatar Builder Platform - Deployment & Setup Guide

## 🚀 Complete Production Deployment Checklist

### Prerequisites
- Node.js 18+ installed
- Git installed
- Vercel account (or other Next.js hosting)
- Supabase account
- API keys for providers (at least one)

---

## 📦 STEP 1: Environment Variables

Create `.env.local` in project root with these variables:

```bash
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI Providers (At least ONE required for avatar generation)
STABILITY_API_KEY=your-stability-api-key          # Option 1: Stability AI
REPLICATE_API_TOKEN=your-replicate-token          # Option 2: Replicate

# Optional Providers
OPENAI_API_KEY=your-openai-key                    # For face analysis (future)
ELEVENLABS_API_KEY=your-elevenlabs-key            # For voice cloning (future)
RUNWAY_API_KEY=your-runway-key                    # Reserved for future features

# App Config
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Getting API Keys:

#### Supabase
1. Go to https://supabase.com/dashboard
2. Create a new project
3. Go to Settings > API
4. Copy `URL` and `anon public` key
5. Copy `service_role` key (keep this secret!)

#### Stability AI (Recommended for avatars)
1. Go to https://platform.stability.ai/
2. Sign up and get API key
3. Add credits to your account ($10 minimum)

#### Replicate (Alternative for avatars)
1. Go to https://replicate.com/
2. Sign up and get API token
3. Add payment method

---

## 🗄️ STEP 2: Database Setup

### A) Run SQL Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the entire contents of `supabase/migrations/001_avatar_builder_schema.sql`
5. Run the query

This creates:
- 7 tables (avatars, wardrobe_items, voice_profiles, talk_clips, jobs, presets, live_sessions)
- Row Level Security policies
- Indexes and triggers

### B) Create Storage Buckets

In Supabase Dashboard > Storage:

1. **Create bucket: `avatars`**
   - Public: YES
   - File size limit: 10MB
   - Allowed MIME types: image/png, image/jpeg, image/webp

2. **Create bucket: `wardrobe`**
   - Public: YES
   - File size limit: 10MB
   - Allowed MIME types: image/png, image/jpeg

3. **Create bucket: `voices`**
   - Public: NO (private)
   - File size limit: 50MB
   - Allowed MIME types: audio/wav, audio/mp3, audio/mpeg

4. **Create bucket: `talk-clips`**
   - Public: YES
   - File size limit: 100MB
   - Allowed MIME types: audio/wav, video/mp4

### C) Set Storage Policies

For each bucket, add these policies in Storage > Policies:

**Upload Policy (all buckets):**
```sql
CREATE POLICY "Users can upload to own folder" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'BUCKET_NAME' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
```

**Read Policy (public buckets only):**
```sql
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'BUCKET_NAME');
```

Replace `BUCKET_NAME` with: `avatars`, `wardrobe`, `voices`, `talk-clips`

---

## 📥 STEP 3: Install Dependencies

```bash
cd avatar-g-frontend-v3
npm install
```

### Additional Dependencies Needed

The project requires these packages (add if missing):

```bash
npm install @supabase/ssr @supabase/supabase-js
npm install replicate openai
npm install uuid
npm install --save-dev @types/uuid
```

---

## 🧪 STEP 4: Local Development

### Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

### Test Multi-Language UI
1. Go to Avatar Builder: http://localhost:3000/services/avatar-builder
2. Click language selector in navigation (top right)
3. Switch between KA / EN / RU
4. Verify all labels translate correctly

### Test Avatar Generation (with API keys)

1. Select an avatar style
2. Customize options (body type, pose, etc.)
3. Enter a prompt or use suggestions
4. Click "Create Avatar"
5. Monitor generation progress
6. Check avatar appears in gallery

### Test with Mock Mode (no API keys)

If you don't have API keys yet:
1. The system automatically uses mock providers
2. Avatars will show placeholder images
3. All UI features work normally
4. Look for console logs: `[ProviderFactory] Using Mock provider`

---

## 🚀 STEP 5: Vercel Deployment

### A) Connect Repository

1. Go to https://vercel.com/dashboard
2. Click "Add New" > "Project"
3. Import your Git repository
4. Select the `avatar-g-frontend-v3` folder if using monorepo

### B) Configure Build Settings

- Framework Preset: **Next.js**
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Node Version: **18.x**

### C) Add Environment Variables

In Vercel Dashboard > Project > Settings > Environment Variables:

Add ALL variables from `.env.local` (see Step 1)

**Important:** Set for all environments (Production, Preview, Development)

### D) Deploy

Click "Deploy" button

Wait for build to complete (2-5 minutes)

### E) Verify Deployment

1. Visit your deployed URL
2. Test language switching
3. Test avatar generation
4. Check browser console for errors
5. Check Vercel logs for server errors

---

## 🔍 STEP 6: Testing Checklist

### ✅ UI & i18n
- [ ] Language selector visible in navigation
- [ ] Language persists after page reload
- [ ] Browser language auto-detection works
- [ ] All avatar builder labels translate (KA/EN/RU)
- [ ] Chat interface labels translate
- [ ] Navigation items translate

### ✅ Avatar Generation
- [ ] Style selection works
- [ ] Body customization controls work
- [ ] Outfit/accessory selection works
- [ ] Prompt preview updates dynamically
- [ ] Reference photo upload works (optional)
- [ ] Generate button triggers API call
- [ ] Progress bar shows during generation
- [ ] Avatar appears in gallery when complete
- [ ] Download button works
- [ ] Turnaround view toggle works (if enabled)

### ✅ Gallery & Management
- [ ] Gallery view shows all user avatars
- [ ] Grid layout responsive on mobile
- [ ] Avatar selection shows preview
- [ ] Favorite toggle works
- [ ] Delete avatar works
- [ ] Statistics update correctly

### ✅ Presets
- [ ] Save preset works
- [ ] Load preset works
- [ ] Export preset (JSON download) works
- [ ] Import preset (JSON upload) works
- [ ] Preset filtering works

### ✅ API & Database
- [ ] Auth check works (logged-in users only)
- [ ] Avatars save to database
- [ ] Images upload to Supabase Storage
- [ ] Job status polling works
- [ ] Error handling shows user-friendly messages

---

## 🐛 STEP 7: Troubleshooting

### Issue: "Unauthorized" error

**Fix:** 
- User not logged in → Implement auth flow
- Check Supabase URL and keys in env vars
- Verify RLS policies are set correctly

### Issue: Avatar generation fails

**Check:**
1. API key is valid (test in provider dashboard)
2. Provider has credits/quota remaining
3. Check Vercel logs for error details:
   ```
   Vercel Dashboard > Project > Deployments > Latest > Functions
   ```
4. Look for provider-specific errors:
   - Stability AI: Check dimensions are valid (1024x1024)
   - Replicate: Check model is available

### Issue: Images not uploading to Storage

**Check:**
1. Storage buckets created (see Step 2B)
2. Storage policies set (see Step 2C)
3. File size under limits
4. MIME types allowed
5. Check Supabase logs: Dashboard > Logs

### Issue: Translations not showing

**Check:**
1. Browser language detection working?
2. Check console for missing key warnings (dev mode only)
3. Verify `LanguageContext.tsx` has all keys
4. Check component is wrapped in `<LanguageProvider>`

### Issue: "Provider not initialized" error

**Fix:**
- At least one AI provider API key must be set
- Check `.env.local` has `STABILITY_API_KEY` OR `REPLICATE_API_TOKEN`
- Restart dev server after adding env vars
- For Vercel: Redeploy after adding env vars

---

## 📊 STEP 8: Monitoring & Logs

### Vercel Function Logs
```
Vercel Dashboard > Project > Logs
```
Filter by function name to see API route logs

### Supabase Logs
```
Supabase Dashboard > Logs
```
Monitor database queries and errors

### Client-Side Errors
Check browser console:
- Network tab for failed API calls
- Console tab for JavaScript errors

---

## 🔐 STEP 9: Security Checklist

- [ ] All API routes have auth checks
- [ ] Supabase RLS policies enabled on all tables
- [ ] Service role key NEVER exposed to client
- [ ] Storage buckets have proper policies
- [ ] Voice consent required before training
- [ ] Rate limiting considered (add if needed)
- [ ] Input validation on all API routes
- [ ] No sensitive data in error messages sent to client

---

## 📈 STEP 10: Next Steps

### Immediate (MVP Launch)
- [x] Multi-language UI (KA/EN/RU)
- [x] Avatar generation (Stability or Replicate)
- [x] Gallery and management
- [x] Preset system
- [ ] User authentication flow
- [ ] Billing/credits system

### Phase 2 (Enhanced Features)
- [ ] Voice cloning (ElevenLabs integration)
- [ ] Talking avatars (D-ID or HeyGen)
- [ ] Wardrobe drag & drop
- [ ] Face scan with camera
- [ ] Advanced outfit fitting

### Phase 3 (Live Features)
- [ ] Live Creator Mode (WebRTC)
- [ ] Real-time face tracking
- [ ] Character switching (Voice A/B/C)
- [ ] Live session recording

---

## 📞 Support & Resources

### Documentation
- Next.js: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Stability AI: https://platform.stability.ai/docs
- Replicate: https://replicate.com/docs

### Common Commands

```bash
# Local development
npm run dev

# Build for production
npm run build

# Start production server locally
npm start

# Lint code
npm run lint

# Type check
npx tsc --noEmit

# View Supabase types
npx supabase gen types typescript --project-id <project-id>
```

### File Structure Reference

```
avatar-g-frontend-v3/
├── app/
│   ├── api/
│   │   ├── avatar/
│   │   │   ├── generate/route.ts    ← Avatar generation
│   │   │   └── talk/route.ts        ← Talking avatar
│   │   ├── voice/
│   │   │   ├── upload/route.ts      ← Voice upload
│   │   │   └── train/route.ts       ← Voice training
│   │   └── jobs/[id]/route.ts       ← Job status
│   └── services/
│       └── avatar-builder/page.tsx  ← Main UI
├── lib/
│   ├── providers/                   ← AI provider adapters
│   │   ├── interfaces.ts
│   │   ├── stability.ts
│   │   ├── replicate.ts
│   │   ├── mock.ts
│   │   └── factory.ts
│   ├── i18n/
│   │   └── LanguageContext.tsx      ← Translations
│   └── supabase/
│       └── server.ts                ← Supabase client
├── types/
│   └── avatar-builder.ts            ← TypeScript types
├── supabase/
│   └── migrations/
│       └── 001_avatar_builder_schema.sql  ← Database schema
└── .env.local                       ← Environment variables
```

---

## ✅ Final Verification

Before launching to users:

1. **Test complete user flow:**
   - Sign up → Create avatar → View gallery → Download

2. **Test on multiple devices:**
   - Desktop (Chrome, Firefox, Safari)
   - Mobile (iOS Safari, Android Chrome)
   - Tablet

3. **Load testing:**
   - Generate multiple avatars in succession
   - Monitor Vercel function duration (should be < 60s)
   - Check database performance

4. **Cost monitoring:**
   - Monitor AI provider usage
   - Set up billing alerts
   - Track storage usage in Supabase

5. **User feedback:**
   - Collect feedback from beta users
   - Monitor error rates
   - Track most-used features

---

## 🎉 Deployment Complete!

Your Avatar Builder platform is now live!

**Support:** Open an issue in the repository or contact the development team.

**Updates:** Check for new features and improvements regularly.

---

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Built with:** Next.js 14, TypeScript, Supabase, Stability AI
