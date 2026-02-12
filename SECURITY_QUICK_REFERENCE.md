# Avatar G Security - Quick Reference Card

## 🚨 5 CRITICAL Issues to Fix Now

### 1. Error Message Exposure 
**Status:** IN PROGRESS
**Files:** `app/api/avatar/generate/route.ts`, `app/api/music/generate/route.ts`, others

❌ **Wrong:**
```typescript
return NextResponse.json({ 
  error: error.message  // EXPOSES INTERNALS!
});
```

✅ **Right:**
```typescript
import { logger } from '@/lib/logger';
logger.error('Generation failed', { error });
return NextResponse.json({ 
  error: 'Failed to generate'  // GENERIC
}, { status: 500 });
```

---

### 2. No Input Validation
**Status:** IN PROGRESS
**Files:** `app/api/groq/route.ts`, `app/api/openrouter/route.ts`, `app/api/xai/route.ts`

❌ **Wrong:**
```typescript
const { message } = await req.json();
if (!message) return; // Only checks existence!
```

✅ **Right:**
```typescript
import { messageSchema } from '@/lib/validation/schemas';
const body = messageSchema.parse(await req.json()); // Validates type, length, format
```

---

### 3. Unbounded Resource Parameters
**Status:** IN PROGRESS
**Files:** `app/api/image-generator/route.ts`, `app/api/video-generator/route.ts`

❌ **Wrong:**
```typescript
const { width = 1024, height = 1024 } = await req.json(); // No max!
// User sends width: 999999 → DoS attack
```

✅ **Right:**
```typescript
const dimensionSchema = z.object({
  width: z.number().min(256).max(1024), // ENFORCED
  height: z.number().min(256).max(1024)
});
const body = dimensionSchema.parse(await req.json());
```

---

### 4. No Error Boundaries
**Status:** TODO
**Files:** Need to create `app/error.tsx` and `app/global-error.tsx`

❌ **Wrong:** No error handling → entire app crashes on any error

✅ **Right:**
```typescript
// File: app/error.tsx
'use client';
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

---

### 5. SQL Injection Risk
**Status:** IN PROGRESS
**File:** `app/api/avatars/route.ts` (line 50)

❌ **Wrong:**
```typescript
const sortBy = url.searchParams.get('sort') || 'created_at'; // User input!
// SELECT * FROM avatars ORDER BY user_input → INJECTION!
```

✅ **Right:**
```typescript
const ALLOWED_COLUMNS = ['created_at', 'title', 'updated_at'];
const sortBy = url.searchParams.get('sort');
if (!ALLOWED_COLUMNS.includes(sortBy)) {
  throw new Error('Invalid sort column');
}
// Now safe to use in query
```

---

## ⚡ Quick Wins (< 1 hour each)

### Remove Console Logs
```bash
# Find all console statements
grep -r "console\." app/api --include="*.ts"

# Replace with logger
# ❌ console.error('message', obj)
# ✅ logger.error('message', obj)
```

### Add Fetch Timeouts
```typescript
// Add to all fetch() calls
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30sec

try {
  const res = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

### Add Rate Limiting
```typescript
import ratelimit from '@/lib/ratelimit';

const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
const { success } = await ratelimit.limit(ip);
if (!success) return new Response('Too many requests', { status: 429 });
```

---

## 📋 Implementation Order

1. **First (30min):** Create error boundaries
   - `app/error.tsx`
   - `app/global-error.tsx`

2. **Second (1hr):** Create validation schema
   - `lib/validation/schemas.ts` (copy from implementation guide)

3. **Third (1hr):** Fix SQL injection
   - Add column whitelist to `app/api/avatars/route.ts`

4. **Fourth (4hrs):** Fix API routes one by one
   - groq → openrouter → xai → image-generator → video-generator
   - Apply: validation + timeout + error handling + rate limit

5. **Fifth (2hrs):** Clean up logging
   - Replace `console.log` with logger
   - Create `lib/logger.ts`

6. **Testing (1hr):**
   - Test each endpoint with invalid input
   - Verify rate limiting works
   - Check error messages are generic

---

## 🛠️ Copy-Paste Fixes

### Fix 1: Error Sanitization Helper
```typescript
// lib/api-utils.ts
export function sanitizeError(error: unknown): { message: string; status: number } {
  if (error instanceof SyntaxError) {
    return { message: 'Invalid request', status: 400 };
  }
  if (error instanceof TypeError) {
    return { message: 'Invalid request format', status: 400 };
  }
  // Default: generic message, log actual error server-side
  console.error('[API Error]', error);
  return { message: 'An error occurred', status: 500 };
}
```

### Fix 2: Timeout Wrapper
```typescript
// lib/fetch-utils.ts
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
```

### Fix 3: Validation Wrapper
```typescript
// lib/validate-request.ts
import { z, ZodSchema } from 'zod';

export async function validateRequest<T>(
  req: NextRequest,
  schema: ZodSchema
): Promise<T> {
  const body = await req.json();
  return schema.parse(body);
}
```

---

## 🚀 Environment Setup

```bash
# 1. Install dependencies
npm install zod winston @upstash/ratelimit

# 2. Update .env.local (no changes needed - check it's secure)
# Verify: NEVER commit .env.local to git

# 3. Create files first
touch app/error.tsx
touch app/global-error.tsx
touch lib/validation/schemas.ts
touch lib/logger.ts
touch lib/ratelimit.ts

# 4. Test locally
npm run dev

# 5. Run tests
npm test
```

---

## ✅ Verification Commands

```bash
# Check for remaining console.log in production code
grep -r "console\." app --include="*.ts" --include="*.tsx" | grep -v ".test" | grep -v ".spec"

# Check for remaining error.message in responses
grep -r "error\.message\|error\.stack" app/api --include="*.ts"

# Check for unvalidated process.env
grep -r "process\.env\." app/api --include="*.ts" | grep -v "NEXT_PUBLIC"

# Verify error boundary exists
test -f app/error.tsx && echo "✅ error.tsx exists" || echo "❌ error.tsx missing"
test -f app/global-error.tsx && echo "✅ global-error.tsx exists" || echo "❌ global-error.tsx missing"
```

---

## 🔐 Security Checklist Before Deploy

- [ ] All 5 CRITICAL issues fixed
- [ ] No console.log in production code
- [ ] All error messages generic (no error.message)
- [ ] All input validated with Zod schemas
- [ ] All external API calls have timeout (30sec)
- [ ] Rate limiting enabled
- [ ] Error boundaries implemented
- [ ] SQL injection protection (column whitelist)
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] No secrets in client code
- [ ] No secrets in git history
- [ ] All API tests passing
- [ ] Load test successful (< 5s response time)
- [ ] Code review approved

---

## 📞 Need Help?

- **Zod validation errors:** Check examples in `SECURITY_FIX_IMPLEMENTATION_GUIDE.md`
- **Error handling patterns:** Look at sanitized versions in implementation guide
- **Rate limiting setup:** See Upstash documentation or copy from guide
- **Logger setup:** Winston config in implementation guide

---

## Timeline Estimate

| Phase | Tasks | Hours | Due |
|-------|-------|-------|-----|
| Phase 1 | Error boundaries + input validation + SQL fix | 8 | Day 1 |
| Phase 2 | Validation on all routes + timeout + rate limiting | 8 | Day 2 |
| Phase 3 | Logging cleanup + auth refactor + testing | 8 | Day 3 |

**Total: 24 hours to production-ready**

---

Last Updated: 2024
Status: 5 CRITICAL issues identified and documented
