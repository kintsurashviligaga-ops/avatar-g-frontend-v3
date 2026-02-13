# Avatar G Platform - Environment Variable Documentation

This document provides a complete reference for all environment variables used in the Avatar G platform.

## 🔐 Security Model

### Client-Safe (NEXT_PUBLIC_*)
These variables are bundled into client-side JavaScript and are publicly accessible:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (RLS-protected)
- `NEXT_PUBLIC_APP_URL` - Frontend URL for meta tags and API origin
- `NEXT_PUBLIC_MOCK_MODE` - Enable mock mode for development

### Server-Only (Never NEXT_PUBLIC_*)
These variables MUST never be exposed to the client:
- Database service role keys
- API keys for AI providers
- Stripe secret keys
- Storage access credentials

---

## 📋 Required Variables

### Core Infrastructure
```bash
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # Server-only

# Application URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com # For metadata, CORS, etc.
```

### Payment (Required for Paid Plans)
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx # Server-only
STRIPE_WEBHOOK_SECRET=whsec_xxxxx # Server-only
STRIPE_PRICE_PRO=price_xxxxx # Basic plan ($30/mo)
STRIPE_PRICE_PREMIUM=price_xxxxx # Premium plan ($150/mo)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx # Client-safe
```

---

## 🤖 AI Provider Keys (Optional)

All AI provider keys are server-only and required only for their respective features:

### Image Generation
```bash
STABILITY_API_KEY=sk-xxxxx # Stability AI (avatar generation, cover art)
```

### Video Generation
```bash
REPLICATE_API_TOKEN=r8_xxxxx # Replicate (music, video, effects)
RUNWAY_API_KEY=xxxxx # Runway ML (advanced video)
```

### Voice & TTS
```bash
ELEVENLABS_API_KEY=xxxxx # ElevenLabs (voice cloning, TTS)
GOOGLE_TTS_API_KEY=xxxxx # Google TTS (fallback)
```

### Chat & Text AI
```bash
OPENAI_API_KEY=sk-xxxxx # OpenAI (GPT models)
OPENROUTER_API_KEY=sk-or-xxxxx # OpenRouter (multi-model access)
DEEPSEEK_API_KEY=xxxxx # DeepSeek (chat fallback)
XAI_API_KEY=xxxxx # X.AI (Grok)
GROQ_API_KEY=gsk_xxxxx # Groq (fast inference, STT)
```

---

## 💾 Storage (Optional - R2 or Supabase)

### Cloudflare R2
```bash
R2_ACCOUNT_ID=xxxxx
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_BUCKET_NAME=avatar-g-assets
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
```

### Generic Storage (Fallback)
```bash
STORAGE_ENDPOINT=https://storage.example.com
STORAGE_ACCESS_KEY=xxxxx
STORAGE_SECRET_KEY=xxxxx
STORAGE_BUCKET=avatar-g
```

---

## ⚙️ Optional Configuration

### Development
```bash
NEXT_PUBLIC_MOCK_MODE=true # Enable mock AI responses
NODE_ENV=development # or production
VERCEL_ENV=development # or production (auto-set on Vercel)
```

### CORS & Origins
```bash
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com # Comma-separated
NEXT_PUBLIC_FRONTEND_ORIGIN=http://localhost:3000
```

---

## 🏗️ Deployment

### Vercel
1. Go to project settings → Environment Variables
2. Add all required variables
3. Set server-only keys to "Server" visibility
4. Redeploy after updating environment variables

### Local Development
Create `.env.local`:
```bash
# Copy from .env.example
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... # Server-only

# Optional: Enable mock mode if you don't have AI provider keys
NEXT_PUBLIC_MOCK_MODE=true
```

---

## ✅ Validation

The platform validates environment variables at runtime:

### Client-Side
- `lib/env/public.ts` validates public env vars

### Server-Side
- `lib/env/server.ts` validates server-only env vars
- Throws errors if required keys are missing
- Prevents accidental client exposure of secrets

### Runtime Checks
- Supabase: Validated on server startup
- Stripe: Validated when creating checkout sessions
- AI Providers: Validated when making API calls (graceful fallback to mock mode)

---

## 🚨 Security Best Practices

1. **Never commit `.env.local` to git** (already in `.gitignore`)
2. **Never use `NEXT_PUBLIC_` prefix for secrets**
3. **Rotate keys regularly** (quarterly recommended)
4. **Use separate keys for development and production**
5. **Monitor Stripe webhook signature verification failures**
6. **Use environment-specific Supabase projects** (dev, staging, prod)

---

## 🔍 Troubleshooting

### "Missing required environment variables"
- Check `.env.local` exists and has required vars
- Restart dev server after adding new environment variables
- On Vercel, ensure variables are set in project settings

### Stripe Events Not Working
- Check `STRIPE_WEBHOOK_SECRET` matches webhook endpoint in Stripe dashboard
- Enable raw body parsing for webhook route
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`

### AI Provider Errors
- Verify API key format (e.g., Stability keys start with `sk-`, Replicate with `r8_`)
- Check billing status on provider dashboards
- Enable `NEXT_PUBLIC_MOCK_MODE=true` for development without real AI calls

---

## 📚 Related Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [SaaS Implementation](SAAS_IMPLEMENTATION.md)
- [Security Audit Report](SECURITY_AUDIT_REPORT.md)
