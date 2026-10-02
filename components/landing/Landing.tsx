/**
 * The marketing landing at /{lang} — for guests (a signed-in visitor goes straight to the studio; see
 * middleware.ts). docs/DESIGN.md is the spec: video first, one cyan accent, cinematic stills from the
 * brand/v1 pack with every word set in code over them, low motion, no glow.
 *
 * Server component: no client JS beyond what Next adds for links. The hero picture is art-directed (9:16 on
 * phones, 16:9 from `md`) through getImageProps, so each device downloads one image at the size it needs.
 */
import Image, { getImageProps } from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { BRAND_V1 } from '@/lib/brand/v1';
import { LANDING_COPY, landingLang, type LandingLang, type ServiceKey } from './copy';
import { ReelLoop } from './ReelLoop';
import { signInPath } from '@/lib/routing/signIn';

const SERVICES: ServiceKey[] = ['video', 'image', 'music', 'avatar'];
/** Dashboard deep links (OmniStudio reads ?mode= once, then drops it). */
const MODE: Record<ServiceKey, string> = { video: 'video', image: 'image', music: 'music', avatar: 'lipsync' };
/** The same three-letter labels as the dashboard's language menu (components/studio/ChatChrome.tsx). */
const LANGS: Array<{ code: LandingLang; label: string }> = [
  { code: 'ka', label: 'ქარ' },
  { code: 'en', label: 'ENG' },
  { code: 'ru', label: 'РУС' },
];

function HeroPicture({ alt }: { alt: string }) {
  const common = { alt, sizes: '100vw', quality: 80, priority: true } as const;
  const { props: { srcSet: desktop } } = getImageProps({ ...common, ...BRAND_V1.hero16x9 });
  const { props: { srcSet: mobile, ...img } } = getImageProps({ ...common, ...BRAND_V1.hero9x16 });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktop} />
      <source media="(max-width: 767px)" srcSet={mobile} />
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img {...img} className="absolute inset-0 h-full w-full object-cover object-[50%_40%]" />
    </picture>
  );
}

/** Each language in its own name, for the phone menu. */
const LANG_NAMES: Record<LandingLang, string> = { ka: 'ქართული', en: 'English', ru: 'Русский' };

/**
 * The segmented switch (tablet and up, and the footer). It draws 32 px tall, but every link's hit area is
 * stretched to 44 px by an empty ::after, so the target meets docs/DESIGN.md §5 without a chunky pill.
 */
function LangSwitch({ lang, path, label, className = '' }: { lang: LandingLang; path: (l: LandingLang) => string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={`w-fit items-center rounded-full border border-white/15 p-0.5 text-[12px] font-medium ${className || 'flex'}`}>
      {LANGS.map((l) => (
        <Link
          key={l.code}
          href={path(l.code)}
          hrefLang={l.code}
          aria-current={l.code === lang ? 'true' : undefined}
          className={`relative flex min-h-[32px] min-w-[36px] items-center justify-center rounded-full px-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${l.code === lang ? 'bg-white text-[#0A0A0A]' : 'text-white/75 hover:text-white'}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The phone header's language control: the current language and a chevron, like the studio's header. The
 * segmented pill needs ~130 px, and next to the wordmark and „შესვლა“ it pushed the header off a 320 px
 * screen. A native <details> works before and without JavaScript, and every row is a 44 px target.
 */
function LangMenu({ lang, path, label }: { lang: LandingLang; path: (l: LandingLang) => string; label: string }) {
  const currentLabel = LANGS.find((l) => l.code === lang)?.label ?? 'ქარ';
  return (
    <details className="group relative sm:hidden">
      <summary aria-label={`${label}: ${LANG_NAMES[lang]}`} className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-white/90 transition-colors hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        {currentLabel}
        <ChevronDown size={14} aria-hidden="true" className="text-white/60 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <nav aria-label={label} className="absolute right-0 top-full z-20 mt-1 w-44 rounded-2xl border border-white/10 bg-[#16161A] p-1 shadow-2xl">
        {LANGS.map((l) => (
          <Link
            key={l.code}
            href={path(l.code)}
            hrefLang={l.code}
            aria-current={l.code === lang ? 'true' : undefined}
            className={`flex min-h-[44px] items-center justify-between rounded-xl px-3 text-[14px] transition-colors ${l.code === lang ? 'text-[#338FE8]' : 'text-white hover:bg-white/5'}`}
          >
            {LANG_NAMES[l.code]}
            {l.code === lang && <Check size={14} aria-hidden="true" />}
          </Link>
        ))}
      </nav>
    </details>
  );
}

export function Landing({ locale }: { locale: string }) {
  const lang = landingLang(locale);
  const t = LANDING_COPY[lang];
  const studio = `/${lang}/dashboard`;
  const signIn = signInPath(lang);

  return (
    <div className="landing min-h-[100svh] bg-[#0A0A0A] text-[#F2F2F3] antialiased">
      {/* ── Hero ─────────────────────────────────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <HeroPicture alt={t.heroAlt} />
        {BRAND_V1.heroLoop ? (
          <video
            className="landing-loop absolute inset-0 hidden h-full w-full object-cover object-[50%_40%] md:block"
            src={BRAND_V1.heroLoop.src}
            poster={BRAND_V1.heroLoop.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        ) : null}
        {/* Legibility: a floor gradient for the copy, a soft left veil on wide screens. No colour, no glow. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/55 to-[#0A0A0A]/10" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-[#0A0A0A]/70 via-transparent to-transparent md:block" aria-hidden="true" />

        {/* The wordmark never shrinks (the "MyAvata" bug); the controls give way instead, and under 360 px the
            gutters tighten so logo, language and „შესვლა“ still fit a 320 px screen. z-20, one above the hero
            copy (z-10, later in the DOM): the phone language menu opens over it. */}
        <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 pt-[max(16px,env(safe-area-inset-top))] max-[359px]:px-3 sm:px-6">
          {/* ONE mark — the name. The rocket tile beside it read as a second logo (and the PNG has no alpha, so it is
              an opaque square); the rocket stays the app icon, favicon and social card, where it stands alone. */}
          <Link href={`/${lang}`} className="flex min-h-[44px] shrink-0 items-center" aria-label="MyAvatar.ge">
            <Wordmark size="sm" tone="onDark" mark />
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link href={`/${lang}/pricing`} className="hidden min-h-[44px] items-center px-2 text-[14px] text-white/80 transition-colors hover:text-white sm:flex">
              {t.nav.pricing}
            </Link>
            <LangMenu lang={lang} path={(l) => `/${l}/landing`} label={t.footer.language} />
            <LangSwitch lang={lang} path={(l) => `/${l}/landing`} label={t.footer.language} className="hidden sm:flex" />
            <Link href={signIn} className="flex min-h-[44px] items-center rounded-full px-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/10 sm:px-3">
              {t.nav.signIn}
            </Link>
          </div>
        </header>

        {/* data-skip-target: "Skip to main content" (AppShell) lands on the headline, past the header's links. */}
        <div id="landing-main" data-skip-target="" className="relative z-10 mx-auto mt-auto w-full max-w-6xl px-4 pb-[max(40px,env(safe-area-inset-bottom))] focus:outline-none sm:px-6 md:pb-24">
          <p className="landing-rise text-[13px] font-medium uppercase tracking-[0.18em] text-white/70">{t.hero.eyebrow}</p>
          <h1 className="landing-rise mt-4 max-w-[13ch] font-display text-[44px] font-bold leading-[1.08] tracking-[-0.01em] text-white sm:text-[60px] lg:text-[76px]">
            {t.hero.title}
          </h1>
          <p className="landing-rise mt-5 max-w-[38ch] text-[17px] leading-relaxed text-white/80 sm:text-[19px]">{t.hero.sub}</p>
          <div className="landing-rise mt-8 flex flex-wrap items-center gap-3">
            <Link href={studio} className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#338FE8] px-6 text-[16px] font-semibold text-[#0A0A0A] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#338FE8]">
              {t.hero.cta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link href={signIn} className="inline-flex min-h-[52px] items-center rounded-full border border-white/25 px-6 text-[16px] font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5">
              {t.hero.secondary}
            </Link>
          </div>
          <p className="landing-rise mt-4 text-[13px] text-white/60">{t.hero.note}</p>
        </div>
      </section>

      {/* A <div>, not a <main>: AppShell already wraps every page in <main id="main-content">, and a main inside a main
          is an a11y error (two "main" landmarks, one nested). */}
      <div>
        {/* ── Reels — the first proof after the hero: this studio makes VIDEO. Three 5 s vertical loops (brand/v1.1,
            scripts/hf-art-pack.md R1–R3), each a photo that moves. Played only while on screen, never under reduced
            motion; the copy says exactly what they are — three photos, three five-second shots. ──────────────── */}
        <section aria-labelledby="reels-title" className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 md:pt-28">
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#338FE8]">{t.reels.kicker}</p>
          <h2 id="reels-title" className="mt-3 max-w-[20ch] font-display text-[32px] font-bold leading-[1.12] sm:text-[44px]">{t.reels.title}</h2>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-white/70 sm:text-[17px]">{t.reels.sub}</p>
          {/* Phones: a swipe strip of large tiles (three 110 px phones read as thumbnails, not reels); the one out of
              view pauses. From `sm`: all three side by side. */}
          <ul className="-mx-4 mt-10 grid snap-x snap-mandatory scroll-px-4 auto-cols-[62%] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-auto sm:max-w-[900px] sm:snap-none sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {BRAND_V1.reels.map((r) => (
              <li key={r.id} className="snap-start">
                <div className="aspect-[9/16] overflow-hidden rounded-2xl bg-[#111214] ring-1 ring-white/10 sm:rounded-3xl">
                  <ReelLoop src={r.src} poster={r.poster} label={t.reels.items[r.id]} />
                </div>
                <p className="mt-2.5 truncate text-[12.5px] text-white/60 sm:text-[14px]">{t.reels.items[r.id]}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Services ───────────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="services-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#338FE8]">{t.services.kicker}</p>
          <h2 id="services-title" className="mt-3 max-w-[20ch] font-display text-[32px] font-bold leading-[1.12] sm:text-[44px]">{t.services.title}</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((key, i) => {
              const item = t.services.items[key];
              const img = BRAND_V1.cards[key];
              return (
                <li key={key}>
                  <Link
                    href={`${studio}?mode=${MODE[key]}`}
                    className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-[#111214] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#338FE8]"
                  >
                    <Image
                      src={img.src}
                      width={img.width}
                      height={img.height}
                      alt={item.alt}
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-300 ease-out group-hover:scale-[1.03] group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/30 to-transparent" aria-hidden="true" />
                    {i === 0 ? (
                      <span className="absolute left-4 top-4 rounded-full bg-[#338FE8] px-2.5 py-1 text-[12px] font-semibold text-[#0A0A0A]">{t.services.main}</span>
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h3 className="font-display text-[22px] font-bold text-white">{item.name}</h3>
                      <p className="mt-1.5 text-[15px] leading-snug text-white/75">{item.line}</p>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-white/90 transition-colors group-hover:text-white">
                        {t.services.open} <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Three steps ────────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="steps-title" className="border-y border-white/10 bg-[#0D0E10]">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#338FE8]">{t.steps.kicker}</p>
            <h2 id="steps-title" className="mt-3 font-display text-[32px] font-bold sm:text-[44px]">{t.steps.title}</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {t.steps.items.map((s, i) => (
                <li key={s.name} className="border-t border-white/15 pt-6">
                  <span className="font-display text-[14px] font-semibold tabular-nums text-[#338FE8]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 font-display text-[24px] font-bold">{s.name}</h3>
                  <p className="mt-2 max-w-[34ch] text-[16px] leading-relaxed text-[#A1A1AA]">{s.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Pricing teaser (billing itself lives on /pricing, untouched) ─────────────────── */}
        <section aria-labelledby="pricing-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <div className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-[#111214] p-8 md:flex-row md:items-end md:justify-between md:p-12">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-[#338FE8]">{t.pricing.kicker}</p>
              <h2 id="pricing-title" className="mt-3 max-w-[22ch] font-display text-[28px] font-bold leading-[1.15] sm:text-[36px]">{t.pricing.title}</h2>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[#A1A1AA]">{t.pricing.line}</p>
            </div>
            <Link href={`/${lang}/pricing`} className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 self-start rounded-full border border-white/25 px-6 text-[15px] font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5 md:self-auto">
              {t.pricing.cta} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ── Closing card ───────────────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden">
          <Image src={BRAND_V1.world.src} width={BRAND_V1.world.width} height={BRAND_V1.world.height} alt="" sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_60%] opacity-70" />
          {/* Fade in from the page above and out to the footer; the middle stays open so the city reads. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0A0A0A] via-transparent to-[#0A0A0A]" aria-hidden="true" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0A0A0A]/80 via-[#0A0A0A]/30 to-transparent" aria-hidden="true" />
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-28 sm:px-6 md:py-40">
            <h2 className="max-w-[16ch] font-display text-[36px] font-bold leading-[1.1] sm:text-[56px]">{t.closing.title}</h2>
            <Link href={studio} className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#338FE8] px-6 text-[16px] font-semibold text-[#0A0A0A] transition-transform duration-200 ease-out hover:-translate-y-0.5">
              {t.closing.cta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-12 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href={`/${lang}`} className="inline-flex min-h-[44px] items-center" aria-label="MyAvatar.ge">
              <Wordmark size="sm" tone="onDark" mark />
            </Link>
            <p className="mt-3 max-w-[32ch] text-[14px] text-[#A1A1AA]">{t.footer.tagline}</p>
          </div>
          <div className="flex flex-col gap-6 md:items-end">
            <nav aria-label={lang === 'en' ? 'Legal' : lang === 'ru' ? 'Правовая информация' : 'სამართლებრივი'} className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[#A1A1AA]">
              <Link href={`/${lang}/terms`} className="min-h-[44px] content-center hover:text-white">{t.footer.terms}</Link>
              <Link href={`/${lang}/privacy`} className="min-h-[44px] content-center hover:text-white">{t.footer.privacy}</Link>
              <Link href={`/${lang}/refund`} className="min-h-[44px] content-center hover:text-white">{t.footer.refund}</Link>
            </nav>
            <LangSwitch lang={lang} path={(l) => `/${l}/landing`} label={t.footer.language} />
            <p className="text-[13px] text-white/45">© 2026 MyAvatar.ge · {t.footer.rights}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
