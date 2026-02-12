# Avatar G Security Fixes - Implementation Guide

## Quick Fix Checklist

Priority order for implementation (do in this sequence):

### Day 1: Error Handling & Validation (Critical Fixes)

- [ ] **Create error boundary** (10 min)
  - [ ] Create `app/error.tsx`
  - [ ] Create `app/global-error.tsx`

- [ ] **Sanitize error responses** (2 hours)
  - [ ] `app/api/avatar/generate/route.ts`
  - [ ] `app/api/music/generate/route.ts`
  - [ ] `app/api/generate/video/route.ts`
  - [ ] `app/api/image-generator/route.ts`
  - Other routes as needed

- [ ] **Add input validation** (4 hours)
  - [ ] Install `npm install zod`
  - [ ] Create `lib/validation/schemas.ts` with all schemas
  - [ ] Add validation to: groq, openrouter, xai, image-generator, video-generator

- [ ] **Add bounds checking** (1 hour)
  - [ ] API routes using width/height/duration parameters

### Day 2: SQL Injection & Configuration (Critical Fixes)

- [ ] **Fix SQL injection** (1 hour)
  - [ ] `app/api/avatars/route.ts` - Add column whitelist
  - [ ] `app/api/jobs/[id]/route.ts`

- [ ] **Add timeout handling** (2 hours)
  - [ ] All external API calls (groq, openrouter, xai, stability, runway)

- [ ] **Add rate limiting setup** (2 hours)
  - [ ] Choose rate limiting solution
  - [ ] Create rate limit middleware
  - [ ] Apply to all API routes

### Days 3-5: Code Quality & Logging

- [ ] **Remove console logs** (2 hours)
  - [ ] Replace with structured logging setup
  - [ ] Configure Winston/Pino

- [ ] **Centralize auth** (2 hours)
  - [ ] Create `lib/middleware/auth.ts`
  - [ ] Apply to all protected routes

---

## Detailed Implementation Steps

### Step 1: Create Error Boundaries

**File: `app/error.tsx`**
```typescript
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

**File: `app/global-error.tsx`**
```typescript
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
```

---

### Step 2: Create Validation Schemas

**File: `lib/validation/schemas.ts`**
```typescript
import { z } from 'zod';

// Common schemas
export const messageSchema = z.object({
  message: z.string()
    .min(1, 'Message is required')
    .max(2000, 'Message cannot exceed 2000 characters')
    .trim()
});

export const dimensionSchema = z.object({
  prompt: z.string().min(1).max(2000),
  width: z.number()
    .int()
    .min(256, 'Width minimum is 256')
    .max(1024, 'Width maximum is 1024')
    .optional()
    .default(1024),
  height: z.number()
    .int()
    .min(256, 'Height minimum is 256')
    .max(1024, 'Height maximum is 1024')
    .optional()
    .default(1024)
});

export const videoSchema = z.object({
  prompt: z.string().min(1).max(2000),
  duration: z.number()
    .int()
    .min(1, 'Duration minimum is 1 second')
    .max(60, 'Duration maximum is 60 seconds')
    .optional()
    .default(4)
});

export const avatarSchema = z.object({
  prompt: z.string()
    .min(1, 'Prompt is required')
    .max(2000, 'Prompt too long'),
  negative_prompt: z.string().max(1000).optional(),
  style_preset: z.string().optional(),
  body_type: z.string().optional(),
  pose: z.string().optional(),
  seed: z.number().optional(),
  width: z.number().int().min(256).max(1024).optional(),
  height: z.number().int().min(256).max(1024).optional()
});

// Sort validation
export const avatarListSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(100),
  offset: z.number()
    .int()
    .min(0)
    .optional()
    .default(0),
  sort: z.enum(['created_at', 'title', 'updated_at']).optional().default('created_at'),
  dir: z.enum(['asc', 'desc']).optional().default('desc')
});
```

---

### Step 3: Update API Routes with Validation

**File: `app/api/groq/route.ts` (Fixed)**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { messageSchema } from "@/lib/validation/schemas";
import { z } from "zod";

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Validate input
    const body = messageSchema.parse(await req.json());

    // Call API with timeout
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "mixtral-8x7b-32768",
          messages: [
            { role: "system", content: "You are Avatar G's AI assistant. Respond in Georgian." },
            { role: "user", content: body.message }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      },
      30000
    );

    if (!response.ok) {
      // Don't expose actual errors
      const errorText = await response.text();
      console.error("[Groq] API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to generate response" },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      response: data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response."
    });

  } catch (error) {
    // Server-side logging only
    if (error instanceof z.ZodError) {
      console.warn("[Groq] Validation error:", error.errors);
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.name === 'AbortError') {
      console.error("[Groq] Request timeout");
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      );
    }

    console.error("[Groq] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**File: `app/api/image-generator/route.ts` (Fixed)**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { dimensionSchema } from "@/lib/validation/schemas";
import { z } from "zod";

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Validate with bounds
    const body = dimensionSchema.parse(await req.json());

    const response = await fetchWithTimeout(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: body.prompt }],
          cfg_scale: 7,
          samples: 1,
          width: body.width,
          height: body.height,
          steps: 30,
        }),
      },
      30000
    );

    if (!response.ok) {
      console.error("[ImageGen] API error:", response.status);
      return NextResponse.json(
        { error: "Failed to generate image" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const imageBase64 = data.artifacts?.[0]?.base64;
    if (!imageBase64) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length.toString(),
      },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 504 }
      );
    }

    console.error("[ImageGen] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**File: `app/api/avatars/route.ts` (Fixed - SQL Injection)**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { avatarListSchema } from "@/lib/validation/schemas";
import { z } from "zod";

const ALLOWED_SORT_COLUMNS = ['created_at', 'title', 'updated_at'] as const;
const ALLOWED_SORT_DIRS = ['asc', 'desc'] as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Health check
    if (searchParams.get('health') === '1') {
      return NextResponse.json({ status: 'ok' });
    }

    // Validate query parameters
    const queryParams = avatarListSchema.parse({
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      sort: searchParams.get('sort'),
      dir: searchParams.get('dir')
    });

    // Whitelist validation (double-check)
    if (!ALLOWED_SORT_COLUMNS.includes(queryParams.sort)) {
      return NextResponse.json(
        { error: 'Invalid sort column' },
        { status: 400 }
      );
    }
    if (!ALLOWED_SORT_DIRS.includes(queryParams.dir)) {
      return NextResponse.json(
        { error: 'Invalid sort direction' },
        { status: 400 }
      );
    }

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ... rest of implementation
    // Now it's safe to use queryParams.sort and queryParams.dir

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }
    console.error('[Avatars] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

### Step 4: Implement Rate Limiting

**Install:**
```bash
npm install @upstash/ratelimit redis@latest
# Or for development:
npm install --save-dev @upstash/redis-local
```

**File: `lib/ratelimit.ts`**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Create a new ratelimiter that allows 10 requests per 1 hour
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
});

export default ratelimit;
```

**Apply to API route:**
```typescript
import ratelimit from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  // Get IP for rate limiting
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('x-real-ip') || 
             '127.0.0.1';

  const { success, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  // ... rest of handler
}
```

---

### Step 5: Remove Console Logs & Add Structured Logging

**Install:**
```bash
npm install winston
```

**File: `lib/logger.ts`**
```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'avatar-g' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ],
});

// Add console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

**Replace console calls:**
```typescript
// ❌ Before
console.error('[Avatar Generation] Error:', error);

// ✅ After
import { logger } from '@/lib/logger';
logger.error('Avatar generation failed', { 
  error: error instanceof Error ? error.message : 'Unknown error',
  errorCode: (error as any)?.code,
  context: 'avatar_generation'
});
```

---

## Environment Variables Checklist

Verify these are set ONLY on server:

```bash
# ✅ Server-side only (keep secret)
SUPABASE_SERVICE_ROLE_KEY=your_secret_key
STABILITY_API_KEY=your_secret_key
RUNWAY_API_KEY=your_secret_key
OPENROUTER_API_KEY=your_secret_key
ELEVENLABS_API_KEY=your_secret_key
GROQ_API_KEY=your_secret_key
XAI_API_KEY=your_secret_key
DEEPSEEK_API_KEY=your_secret_key
R2_SECRET_ACCESS_KEY=your_secret_key
STORAGE_SECRET_KEY=your_secret_key

# ✅ Public (safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_FRONTEND_ORIGIN=https://yourfrontend.com
NEXT_PUBLIC_MOCK_MODE=false
```

**Never commit sensitive keys to git!**

---

## Testing Checklist

```bash
# 1. Test input validation
curl -X POST http://localhost:3000/api/groq \
  -H "Content-Type: application/json" \
  -d '{"message": ""}'  # Should return 400

curl -X POST http://localhost:3000/api/groq \
  -H "Content-Type: application/json" \
  -d '{"message": "'$(printf 'x%.0s' {1..3000})'"}'  # Should return 400 (too long)

# 2. Test error response sanitization
curl http://localhost:3000/api/nonexistent  # Should NOT show stack trace

# 3. Test rate limiting
for i in {1..20}; do curl http://localhost:3000/api/groq; done  # Some should get 429

# 4. Test timeout
curl --max-time 1 http://localhost:3000/api/groq  # Should timeout if no response

# 5. Test SQL injection protection
curl "http://localhost:3000/api/avatars?sort=created_at;%20DROP%20TABLE--"  # Should return 400
```

---

## File Changes Summary

| File | Change | Impact | Effort |
|------|--------|--------|--------|
| `app/error.tsx` | NEW | Handles component-level errors | 10min |
| `app/global-error.tsx` | NEW | Handles app-level errors | 10min |
| `lib/validation/schemas.ts` | NEW | Centralized validation | 2hr |
| `lib/logger.ts` | NEW | Structured logging | 1hr |
| `lib/ratelimit.ts` | NEW | Rate limiting | 1hr |
| `app/api/groq/route.ts` | MODIFY | Add validation, timeout, error handling | 1hr |
| `app/api/openrouter/route.ts` | MODIFY | Add validation, timeout, error handling | 1hr |
| `app/api/xai/route.ts` | MODIFY | Add validation, timeout, error handling | 1hr |
| `app/api/image-generator/route.ts` | MODIFY | Add bounds, validation, timeout | 1hr |
| `app/api/video-generator/route.ts` | MODIFY | Add bounds, validation, timeout | 1hr |
| `app/api/avatars/route.ts` | MODIFY | Add column whitelist | 30min |
| All API routes | MODIFY | Remove console.log, add rate limiting | 2hr |
| `lib/providers/*.ts` | MODIFY | Remove console.log | 1hr |
| `lib/auth/*.ts` | MODIFY | Remove console.log | 30min |

**Total Estimated Time: ~16-20 hours**

---

## Post-Fix Testing

After implementing fixes:

1. Run unit tests for validation schemas
2. Integration test each API endpoint
3. Load test with `k6` or `artillery`
4. OWASP Top 10 check
5. Security code review before merge
6. Pen test before production

---

## Deployment Checklist

- [ ] All console.log removed from production build
- [ ] Error responses sanitized (no error.message)
- [ ] Input validation on all API endpoints
- [ ] Rate limiting enabled
- [ ] Timeout handling on external API calls
- [ ] Error boundaries in place
- [ ] Security tests pass
- [ ] Code review approved
- [ ] Staging deployment successful
- [ ] CORS configured
- [ ] HTTPS enforced
- [ ] Security headers set (CSP, X-Frame-Options, etc)

---

## Additional Resources

- Zod Documentation: https://zod.dev
- OWASP API Security: https://owasp.org/www-project-api-security/
- Next.js Security: https://nextjs.org/docs/app/building-your-application/deploying/production-checklist
- Winston Logger: https://github.com/winstonjs/winston
- Upstash Rate Limiting: https://upstash.com/docs/redis/features/ratelimiting

