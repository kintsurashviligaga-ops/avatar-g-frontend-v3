# Avatar G v3 - Cinematic Landing Setup Guide

## ✅ Prerequisites

- Node.js 18+
- Supabase project
- Next.js 14.2+ (already installed)
- Three.js + @react-three/fiber (already in dependencies)

## 🗄️ Step 1: Create Supabase Table

### Option A: Supabase Dashboard (Visual)

1. Go to Supabase Dashboard → SQL Editor
2. Create new query
3. Paste the SQL from `migrations/001_create_avatars_table.sql`
4. Execute

### Option B: Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-id>

# Run migration
supabase migration up
```

### Verify Table Created

```sql
SELECT * FROM avatars LIMIT 1;  -- Should return empty result
```

## 🔑 Step 2: Environment Variables

Update your `.env.local`:

```bash
# Already set from previous setup
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Verify these exist
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## 🧪 Step 3: Local Testing

### Start Development Server

```bash
npm run dev
```

### Test Avatar Persistence Flow

1. **Visit Landing Page**
   ```
   http://localhost:3000/
   ```
   - Should see 3D cinematic scene
   - Center avatar slowly rotating
   - 6 service icons orbiting
   - Space background with particles

2. **Create Avatar**
   ```
   http://localhost:3000/services/avatar-builder
   ```
   - Generate an avatar as usual
   - On success → avatar auto-saved to Supabase
   - Check Supabase dashboard: `avatars` table should have new row

3. **Test Persistence**
   - Refresh landing page
   - Your avatar should load in 3D scene (instead of placeholder)
   - May take 1-2 seconds to load GLB model

4. **Check Browser Console**
   - Should see avatar fetch logs
   - No TypeScript errors
   - Three.js WebGL context initialized

## 🚀 Step 4: Deploy to Vercel

### Prerequisites

- Vercel account connected to GitHub
- Repository pushed to GitHub

### Configure Environment

1. Go to Vercel Project Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```

### Deploy

```bash
git add .
git commit -m "feat: cinematic landing + user avatar persistence + 3D orbit system"
git push origin main
```

Vercel will auto-deploy. Find deployment link in Vercel dashboard.

### Verify Production Deployment

1. Visit production URL
2. Check Network tab:
   - `/api/avatars/latest` should return 200
   - Model fetch should be streaming
3. Check Console:
   - No DYNAMIC_SERVER_USAGE errors
   - Three.js initialized
   - Avatar loaded

## 🔍 Troubleshooting

### Issue: "Avatars table not found"

**Solution:**
```bash
# Verify table exists
supabase db dump

# Or in Supabase dashboard → Table Editor → avatars should appear
```

### Issue: Avatar not loading on refresh

**Check:**
1. Supabase URL correct in `.env.local`
2. RLS policies enabled on `avatars` table
3. Service role key has no restrictions
4. Browser console for fetch errors

```typescript
// Debug avatar fetch
const response = await fetch(`/api/avatars/latest?owner_id=xyz`);
const data = await response.json();
console.log('Avatar fetched:', data);
```

### Issue: Three.js error "WebGL not supported"

**Solution:**
- Check browser supports WebGL (Chrome/Firefox/Safari all do)
- Clear browser cache
- Try incognito window
- Check browser console for specific error

### Issue: "DYNAMIC_SERVER_USAGE" build error on Vercel

**Solution:**
- Already fixed! All API routes have `export const dynamic = 'force-dynamic'`
- If error persists, check file has the export at top level

```typescript
// ✅ Correct
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // ...
}

// ❌ Wrong
export async function GET(request: NextRequest) {
  export const dynamic = 'force-dynamic'; // Too late!
}
```

## 📊 Monitoring

### Supabase Dashboard

Check:
- `avatars` table row count increasing
- API throughput under "Activity"
- Error logs under "Logs"

### Vercel Analytics

- Function duration: `/api/avatars/latest` should be <100ms
- Build time: Should be ~2-3 minutes
- No deployment errors

## 🎯 Success Criteria

✅ Landing page loads 3D scene in <3 seconds
✅ Service icons orbit smoothly around avatar
✅ Space background has nebula + particles
✅ Avatar auto-saves after generation
✅ Avatar loads on page refresh
✅ Build passes locally and on Vercel
✅ No console errors in production
✅ RLS policies prevent cross-user access

## 🚨 Important Notes

### Security

- Never commit `.env.local` with real keys
- Service role key should NEVER appear in client code
- Only API routes know service role key
- Anonymous IDs are UUIDs (cryptographically safe)

### Performance

- Avatar models cached by browser
- Supabase queries use indexes
- Three.js geometries disposed on unmount
- No memory leaks from event listeners

### Scalability

- Supabase auto-scales to millions of avatars
- API routes use Vercel Functions (auto-scale)
- No database connection pooling needed
- Supports unlimited concurrent users

## 📞 Support

If issues occur:

1. Check browser console for errors
2. Verify `.env.local` has correct values
3. Check Supabase project is active
4. Review Vercel deployment logs
5. Try local `npm run build` first

Good luck! 🚀
