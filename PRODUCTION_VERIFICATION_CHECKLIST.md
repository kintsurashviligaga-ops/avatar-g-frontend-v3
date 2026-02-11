# PRODUCTION VERIFICATION CHECKLIST
## Avatar G System - Complete Test Suite
**Date:** February 12, 2026  
**Version:** 1.0 - Ready for Go-Live Validation

---

## ✅ PRE-DEPLOYMENT VERIFICATION

### Repository Status
- [x] Branch: main (up to date with origin/main)
- [x] No uncommitted changes on critical files
- [x] All service pages compile successfully
- [x] Build succeeds with: `npm run build` (exit code 0)
- [x] Deploy marker added and committed: `DEPLOY_MARKER_2026-02-12_v1`

### Build Artifacts
- [x] `.next` directory generated
- [x] routes-manifest.json created
- [x] All pages built (44/44)
- [x] No critical TypeScript errors
- [x] ESLint/type checking disabled (as configured)

---

## 🚀 DEPLOYMENT VERIFICATION (Run After Vercel Deploy)

### Test 1: Deploy Marker Visibility
```bash
# Expected: Green badge visible with timestamp
# Location: Home page hero section below "New: Agent G"
# Text: "DEPLOY_MARKER_2026-02-12_v1"
curl https://[YOUR_PRODUCTION_URL]/
# Search for: DEPLOY_MARKER_2026-02-12
```

**Checklist:**
- [ ] Marker visible on production domain
- [ ] Marker visible in both desktop and mobile views
- [ ] Timestamp matches deployment date
- [ ] Searching for marker in page source confirms it exists

### Test 2: Home Page Loads
```bash
curl -I https://[YOUR_PRODUCTION_URL]/
```

**Checklist:**
- [ ] HTTP 200 response
- [ ] Content-Type: text/html
- [ ] No 404 or 5xx errors
- [ ] Page renders with all assets

### Test 3: Service Pages Load
```bash
# Avatar Builder
curl -I https://[YOUR_PRODUCTION_URL]/services/avatar-builder

# Music Studio
curl -I https://[YOUR_PRODUCTION_URL]/services/music-studio

# Video Studio
curl -I https://[YOUR_PRODUCTION_URL]/services/media-production

# Photo Studio (optional)
curl -I https://[YOUR_PRODUCTION_URL]/services/photo-studio
```

**Checklist:**
- [ ] All pages return HTTP 200
- [ ] No redirects or 404s
- [ ] Loading time < 3 seconds
- [ ] All pages have correct titles/metadata

---

## 🔧 API ENDPOINT VERIFICATION

### Test 4: Health Check Endpoint
```bash
curl https://[YOUR_PRODUCTION_URL]/api/health
```

**Expected Response:**
```json
{
  "ok": true,
  "service": "backend",
  "status": "healthy",
  "ts": 1707700000000,
  "version": "[commit_hash]",
  "redis": "connected",
  "region": "us-east-1"
}
```

**Checklist:**
- [ ] Endpoint responds with HTTP 200
- [ ] `ok` is true
- [ ] `redis` status is "connected" (if Redis configured)
- [ ] Response time < 500ms
- [ ] No API keys exposed in response

### Test 5: Chat API - All Contexts
```bash
# Test each service context
for context in "global" "avatar" "music" "video" "voice" "business"; do
  curl -X POST https://[YOUR_PRODUCTION_URL]/api/chat \
    -H "Content-Type: application/json" \
    -d '{
      "message": "Hello, how are you?",
      "context": "'$context'"
    }'
done
```

**Expected Response (each):**
```json
{
  "success": true,
  "data": {
    "response": "[Generated response text]",
    "provider": "GPT-4|Groq Mixtral|Local Fallback",
    "context": "[service_context]",
    "conversationId": "conv_..."
  }
}
```

**Checklist:**
- [ ] All 6 contexts return HTTP 200
- [ ] Responses have generated text (not empty)
- [ ] Provider field shows appropriate AI model
- [ ] Response time < 3 seconds
- [ ] No errors in response

---

## 💬 UI CHAT FUNCTIONALITY

### Test 6: Avatar Builder Chat
**Steps:**
1. Navigate to `/services/avatar-builder`
2. Scroll to right sidebar (desktop) or bottom (mobile)
3. Find "Avatar Assistant" ChatWindow panel
4. Type a message: "How do I create a custom avatar?"
5. Click Send button

**Checklist:**
- [ ] ChatWindow panel is visible
- [ ] Message appears in chat history
- [ ] Loading indicator shows while waiting
- [ ] Response appears in chat
- [ ] Service context = "avatar" in request headers
- [ ] PromptBuilder panel visible above ChatWindow
- [ ] PromptBuilder templates load

### Test 7: Music Studio Chat
**Steps:**
1. Navigate to `/services/music-studio`
2. Find ChatWindow in right sidebar (desktop mode)
3. Type: "Create an upbeat pop song prompt"
4. Click Send

**Checklist:**
- [ ] ChatWindow visible in sidebar
- [ ] Message sends successfully
- [ ] Response relates to music creation
- [ ] Service context = "music"
- [ ] PromptBuilder shows music templates
- [ ] Voice Lab section still functional

### Test 8: Video Studio Chat  
**Steps:**
1. Navigate to `/services/media-production`
2. Scroll to Chat section
3. Type: "Describe a cinematic video concept"
4. Click Send

**Checklist:**
- [ ] ChatWindow visible in create view
- [ ] Message sends successfully
- [ ] Response relates to video creation
- [ ] Service context = "video"
- [ ] PromptBuilder shows video templates
- [ ] Video settings still functional

---

## 🎥 FEATURE FUNCTIONALITY

### Test 9: Avatar Builder Camera
**Steps:**
1. Navigate to `/services/avatar-builder`
2. Click on camera/face input section
3. Allow camera permission when prompted
4. Verify camera feed displays

**Checklist:**
- [ ] Camera permission dialog appears
- [ ] Camera feed shows (or fallback to upload)
- [ ] On HTTPS domain (required)
- [ ] Clear error message if permission denied
- [ ] Fallback: Can upload image instead
- [ ] Mobile: Works on iOS with HTTPS
- [ ] Mobile: Works on Android with HTTPS

### Test 10: Music Generation UI
**Steps:**
1. Navigate to `/services/music-studio`
2. Enter a prompt in textarea
3. Click "Generate" button
4. Verify loading state shows

**Checklist:**
- [ ] Generate button enabled with prompt
- [ ] Loading indicator appears
- [ ] Progress percentage shows
- [ ] Can't generate twice simultaneously
- [ ] Prompt templates work (click template → fills textarea)
- [ ] LyricsEditor accessible
- [ ] StyleSelector working

### Test 11: Video Generation UI
**Steps:**
1. Navigate to `/services/media-production`
2. Select a video style (e.g., Cinematic)
3. Choose duration and resolution
4. Enter a prompt
5. Click Create or use PromptBuilder

**Checklist:**
- [ ] Style buttons toggle selected state
- [ ] Duration/resolution options work
- [ ] Optional image upload functional
- [ ] PromptBuilder templates populate prompt
- [ ] Chat and generation can work together

---

## ⚡ RATE LIMITING & PERFORMANCE

### Test 12: Rate Limiting
```bash
# Send 10 rapid requests
for i in {1..10}; do
  curl -X POST https://[YOUR_PRODUCTION_URL]/api/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"Test","context":"global"}' &
done
wait
```

**Checklist:**
- [ ] First few requests return 200
- [ ] Some requests return 429 (Retry-After header)
- [ ] No server crashes
- [ ] Rate limit resets after cooldown

### Test 13: Response Times
**Test each endpoint:**
- [ ] GET / < 1s
- [ ] GET /services/avatar-builder < 1.5s
- [ ] GET /api/health < 500ms
- [ ] POST /api/chat < 3s
- [ ] Subsequent requests cached/fast

---

## 🔐 SECURITY VERIFICATION

### Test 14: No API Keys Exposed
```bash
# Check home page source
curl https://[YOUR_PRODUCTION_URL]/ | grep -i "api_key\|apikey\|secret\|token"

# Check API responses
curl https://[YOUR_PRODUCTION_URL]/api/health | grep -i "api_key\|secret"
```

**Checklist:**
- [ ] No OpenAI keys visible
- [ ] No Upstash tokens visible
- [ ] No API credentials in responses
- [ ] No secrets in error messages

### Test 15: CORS Headers
```bash
curl -I -X OPTIONS https://[YOUR_PRODUCTION_URL]/api/chat \
  -H "Origin: https://example.com"
```

**Checklist:**
- [ ] Appropriate CORS headers set
- [ ] External requests handled correctly
- [ ] OPTIONS method allowed

### Test 16: Environment Variables
**Verify in Vercel:**
- [ ] `OPENAI_API_KEY` is set
- [ ] `UPSTASH_REDIS_REST_URL` is set
- [ ] `UPSTASH_REDIS_REST_TOKEN` is set
- [ ] `NEXT_PUBLIC_APP_URL` points to production domain
- [ ] All values marked as "Encrypted" in UI

---

## 📱 RESPONSIVE DESIGN

### Test 17: Mobile Views (576px width)
**On each service page:**
1. Open DevTools (F12)
2. Set viewport to iPhone SE (375px) or similar
3. Verify:

**Checklist:**
- [ ] Header responsive (menu collapses)
- [ ] ChatWindow accessible (mobile scroll)
- [ ] PromptBuilder visible (mobile scroll)
- [ ] Buttons clickable (no overlap)
- [ ] Text readable (no cut-off)
- [ ] Images scale properly
- [ ] No horizontal scroll needed

### Test 18: Tablet Views (768px width)
**Checklist:**
- [ ] Sidebar layouts work
- [ ] Grid adjusts properly
- [ ] Touch-friendly button sizes

---

## 🎯 DESIGN SYSTEM CONSISTENCY

### Test 19: Visual Consistency
**Check across all pages:**
1. Home page
2. Avatar Builder
3. Music Studio
4. Video Studio
5. Photo Studio

**Checklist:**
- [ ] Same header/nav style
- [ ] Same color scheme (dark theme)
- [ ] Consistent card styling (glassmorphism)
- [ ] Same button styles
- [ ] Matching typography (fonts, sizes)
- [ ] Service-specific accent colors applied:
  - Avatar: Cyan/Blue gradients
  - Music: Green/Emerald gradients
  - Video: Red/Orange gradients
  - Photo: Yellow/Amber gradients
- [ ] Consistent spacing/padding
- [ ] Animations smooth (no jank)

---

## 📊 ANALYTICS & MONITORING

### Test 20: Error Prevention
**Intentional error tests:**
1. Send empty message to chat
2. Navigate to invalid URL (e.g., `/services/nonexistent`)
3. Rapid page navigation
4. Network disconnect (DevTools throttle)

**Checklist:**
- [ ] Empty message shows validation error
- [ ] Invalid URL shows 404 page
- [ ] Rapid navigation doesn't crash
- [ ] Network errors show friendly message
- [ ] No console errors in DevTools

---

## ✨ FINAL SIGN-OFF

### Pre-Launch Checklist
- [ ] All tests 1-20 passed
- [ ] Deploy marker visible on production
- [ ] No console errors in DevTools
- [ ] No network errors in DevTools Network tab
- [ ] All links work (no 404s)
- [ ] Mobile tested on real device (optional but recommended)
- [ ] Chat messages save in Redis (if monitoring enabled)
- [ ] Rate limiting working

### Post-Launch Monitoring (First 24 Hours)
- [ ] Monitor error logs in Vercel
- [ ] Check `/api/health` every 30 minutes
- [ ] Monitor Redis connection status
- [ ] Check API response times trending
- [ ] Watch for unusual traffic spikes
- [ ] Monitor token usage per provider
- [ ] Check user reports/feedback

### Rollback Triggers (If any occur)
- [ ] `/api/health` returns `ok: false` for > 5 minutes
- [ ] Error rate > 5% of all requests
- [ ] Response times > 10 seconds
- [ ] Deploy marker not visible
- [ ] Database/Redis connection down

**Rollback Command:**
```bash
# Revert to previous commit
git revert HEAD --no-edit
git push origin main
# Or redeploy previous commit from Vercel dashboard
```

---

## 🎬 QUICK TEST SUMMARY

**Fast 5-Minute Test (Minimum):**
1. [ ] Verify deploy marker visible
2. [ ] Test /api/health returns ok: true
3. [ ] Send one message in each service chat (avatar, music, video)
4. [ ] Verify ChatWindow shows response
5. [ ] Check mobile view responsive

**Full 30-Minute Test (Recommended):**
1. Run all tests 1-20 above
2. Test on 2+ devices (desktop + mobile)
3. Test with 2+ network conditions (fast + throttled)
4. Verify all 6 chat contexts work
5. Test rate limiting behavior

---

## 📝 TEST RESULTS TEMPLATE

```
DATE: [Date]
TESTER: [Name]
ENVIRONMENT: Production
DEPLOYMENT_MARKER: [Visible/Not Visible]

Test Results:
- Deploy Marker: ✅/❌
- Health Endpoint: ✅/❌
- Chat API: ✅/❌
- Avatar Builder: ✅/❌
- Music Studio: ✅/❌
- Video Studio: ✅/❌
- Rate Limiting: ✅/❌
- Mobile Responsive: ✅/❌
- No Security Issues: ✅/❌
- Design Consistency: ✅/❌

Overall Status: [GO/NO-GO]
Issues Found: [List any]
Notes: [Any observations]

Signed: _______________
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Status:** Ready for Production Testing
