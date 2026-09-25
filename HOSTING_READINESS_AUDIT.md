# MyAvatar.ge — Hosting Readiness Audit

**Date:** 2026-09-25  
**Repository:** `kintsurashviligaga-ops/avatar-g-frontend-v3`  
**Current stack:** Next.js 14.2.35, App Router, Node 20 target, Supabase, Stripe, Redis, media providers, cron/webhooks

## Executive conclusion

| Target | Full product unchanged? | Assessment |
|---|---:|---|
| **Netlify** | **Mostly yes, with adapter/config work** | Recommended alternative. Netlify documents full support for Next.js App Router, SSR, ISR, Route Handlers/API routes, Middleware, redirects/rewrites, and image optimization through its OpenNext adapter. The repository still needs non-Vercel cron wiring, timeout review, environment migration, and deployment smoke tests. |
| **GitHub Pages** | **No** | Not suitable for the current product. GitHub Pages serves static HTML/CSS/JS only. This application relies on 423 API route files, middleware, authentication cookies, server rendering, webhooks, streaming, billing, cron jobs, and server-side media processing. A separate static marketing-only export could be made, but it would not be the full MyAvatar product. |
| **Self-hosted Node / another PaaS** | **Yes, with operational work** | Technically viable if it runs `next start` or a container and provides the required secrets, persistent external services, process supervision, HTTPS, cron, and webhook routing. This is more operationally complex than Netlify. |

## Verification evidence

- `npm ci`: **completed successfully** under the sandbox’s Node 22 runtime. The project declares Node `20.x`, so deployment should use Node 20.
- `npm run typecheck`: **passed** with TypeScript 5.9.3.
- `npm test -- --runInBand`: **passed — 222 test suites, 2529 tests**.
- `npm run build`: first failed only because local build environment variables were absent (`SUPABASE_URL`).
- CI-style build with dummy compile-time Supabase variables: **passed**. The production build compiled, type-checked, collected page data, and emitted the full route manifest.
- `npm audit --omit=dev --audit-level=high`: reports **38 production-tree vulnerabilities**: 1 critical, 11 high, 18 moderate, 8 low. Do not run `npm audit fix --force` blindly because the suggested Next.js upgrade is a breaking major-version change.

## What the code requires from the hosting platform

### 1. Server runtime

This is not a static site. The application has:

- **423 API route files** under `app/api`.
- Authentication and session middleware via Supabase cookies.
- Dynamic server-rendered routes and route handlers.
- Streaming endpoints such as chat/pipeline SSE.
- Stripe, phone, WhatsApp, Telegram, and other webhooks.
- Server-side media work using `ffmpeg-static`, `sharp`, `@resvg/resvg-js`, PDF/document tooling, and external AI providers.
- Upload-signing routes that intentionally bypass request-size limits by sending media directly to Supabase Storage.

A replacement host must therefore provide a Node/serverless runtime, not only static file hosting.

### 2. Environment and secrets

The production deployment needs the equivalent of the project’s environment contract, including at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_AUTH_REDIRECT_URL`
- Provider and billing keys used by the enabled features
- Redis/rate-limit variables where enabled
- `CRON_SECRET` and worker tokens for scheduled jobs
- Storage credentials for Cloudflare R2/Supabase Storage where enabled

Never copy `.env.local` or production secrets into GitHub. Configure the new host’s encrypted environment-variable store instead.

### 3. Vercel-specific pieces that do not transfer automatically

- `vercel.json` declares function timeouts and three cron schedules. Netlify will not use this file as its cron configuration.
- Cron jobs must be recreated using Netlify Scheduled Functions, an external scheduler, or a small always-on worker. The routes already fail closed unless authorized, which is good; the scheduler must send the expected `Authorization: Bearer $CRON_SECRET` header.
- `VERCEL_*` variables are used for diagnostics, build IDs, environment labels, and service-worker cache stamping. They should become host-neutral fallbacks rather than being assumed present.
- Vercel Analytics and Speed Insights are optional observability integrations. Keep Sentry/PostHog, or replace the Vercel-specific layer with a host-neutral analytics choice.
- The existing `vercel.json` `maxDuration` settings need a Netlify equivalent or a redesign for long-running jobs. The safest pattern is to keep expensive work asynchronous, persist job state, and poll/status-stream from the client.

## Netlify assessment

Netlify’s official Next.js documentation says its OpenNext adapter supports the App Router, SSR, ISR, SSG, React Server Components, Server Actions, streaming, Middleware, Route Handlers/API routes, image optimization, redirects/rewrites, and internationalization.

### Expected migration work

1. Connect the GitHub repository to Netlify and select Node 20.
2. Set the required environment variables for production, preview, and local contexts.
3. Add a `netlify.toml` for explicit build/runtime settings and any scheduled functions.
4. Recreate the three Vercel cron schedules and pass the expected authorization header.
5. Review all routes with 30–600 second Vercel duration assumptions, especially video assemble, montage, dubbing, presentation, Nanobanana, and orchestration routes.
6. Verify native/runtime packaging for `ffmpeg-static`, `sharp`, `@resvg/resvg-js`, and any file-system usage. Netlify documents limitations for **Node.js Middleware** involving filesystem access and C++ addons; those operations must remain in server functions, not Middleware.
7. Update auth callback URLs and allowed origins in Supabase, Stripe, VAPI/voice providers, and webhook providers to the Netlify custom domain.
8. Run smoke tests for auth, upload signing, one cheap AI request, Stripe webhook verification, one media route, SSE, and cron authorization before switching DNS.

### Recommendation

**Netlify is a viable alternative for the full app**, but it is not a zero-change mirror of Vercel because the repository deliberately relies on Vercel Cron, Vercel environment metadata, and Vercel-oriented duration/tracing assumptions.

## GitHub Pages assessment

GitHub Pages officially hosts HTML, CSS, and JavaScript from a repository and supports custom domains. It does not provide the Node server required by this application.

Next.js static export explicitly does **not** support the features this product depends on, including:

- API Routes
- Redirects and rewrites
- Headers
- Proxy/Middleware behavior needed by this app
- ISR
- Server-side rendering
- Cookies/session-backed server logic
- Default image optimization
- Dynamic runtime processing

### What could work on GitHub Pages

A separate, deliberately reduced static site could be exported: a public landing page, documentation, pricing copy, or the read-only Calendar Lab with all data mocked at build time. It would not include login, Supabase data, billing, AI generation, uploads, webhooks, cron, or server-side media processing.

## Security and maintenance findings

1. **Dependency remediation is required before a production host migration.** The production dependency tree reports a critical Next.js advisory plus high-severity advisories in Next.js dependencies and other packages. Upgrade in a dedicated branch, run the full test/build suite, and review breaking changes.
2. **Pin Node 20 in every host.** The repo declares `20.x`; the sandbox used Node 22.13.0 and emitted an engine warning during install.
3. **Do not use static export for the current app.** Adding `output: 'export'` would break the app’s API/auth/server behavior; it is only appropriate for a separate static product slice.
4. **Keep external storage and queues external.** The code already assumes Supabase/Redis/R2-style services; neither GitHub Pages nor a static Netlify site replaces them.
5. **The latest Calendar Lab icon issue was corrected** (`CircleHelp` → `HelpCircle`) and the project still passes the test suite; the CI-style build passed after the correction when Supabase compile-time variables were supplied.

## Final recommendation

- If the goal is to move **the full MyAvatar product** away from Vercel: choose **Netlify**, then complete the cron, environment, timeout, native-binary, webhook, and smoke-test migration before changing the `myavatar.ge` DNS.
- If the goal is only to publish **a public brochure/landing page cheaply**: create a separate static export and use GitHub Pages; do not point the full application domain at that static export.
- Do not migrate production traffic until the dependency audit is addressed and a real environment smoke test passes on the target host.

## References

- [Netlify — Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Next.js — Static Exports](https://nextjs.org/docs/pages/guides/static-exports)
- [GitHub Pages — About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
