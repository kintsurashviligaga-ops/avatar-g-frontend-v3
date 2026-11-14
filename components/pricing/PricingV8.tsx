/**
 * PricingV8 — the proposed Phase 8.1 pricing page (server component, no client JS). Every number comes from
 * lib/billing/margin (plans, top-ups and the per-action price list computed by the 65 % rule), so the page can never
 * show a price the engine would not charge. Rendered by /[locale]/pricing only while NEXT_PUBLIC_PRICING_V8 is on.
 * Buttons go to the normal sign-up; checkout and BOG code are untouched.
 */
import Link from 'next/link';
import { priceList, USER_FACING_IDS, type PriceRow } from '@/lib/billing/margin/catalog';
import { PLANS, TOPUPS, creditGelOf, planUsd, whatYouGet } from '@/lib/billing/margin/packages';
import type { ServiceId } from '@/lib/billing/margin/cogs';
import { signInPath } from '@/lib/routing/signIn';

type L = 'ka' | 'en';
const T = {
  ka: {
    title: 'ფასები',
    lead: 'ერთი კრედიტი ყველა სერვისზე: ვიდეო, სურათი, მუსიკა, ხმა და ლაივ ავატარი. ფასი, რომელსაც ხედავ, არის ის, რაც ჩამოიჭრება.',
    month: '/თვე',
    credits: 'კრედიტი',
    perCredit: 'ერთი კრედიტი',
    youGet: 'რას მიიღებ (ან ერთს, ან ნარევს)',
    videos: '8 წმ ვიდეო (720p)',
    images: 'სურათი (1K)',
    songs: 'სიმღერა',
    avatar: 'წუთი ლაივ ავატარით',
    tts: 'წუთი ხმოვანი კითხვა',
    rollover: (m: number) => `გამოუყენებელი კრედიტი გადადის ${m} თვით`,
    free: 'დაიწყე უფასოდ',
    choose: 'არჩევა',
    popular: 'პოპულარული',
    topupsTitle: 'კრედიტის შევსება',
    topupsLead: 'ერთჯერადი გადახდა, გამოწერის გარეშე. შევსებული კრედიტი არ იწურება.',
    bonus: 'ბონუსი',
    buy: 'ყიდვა',
    tableTitle: 'რა ღირს თითოეული მოქმედება',
    action: 'მოქმედება',
    unit: 'ერთეული',
    price: 'კრედიტი',
    fairTitle: 'დამალული საფასურის გარეშე',
    fair: [
      'კრედიტი ჩამოიჭრება მხოლოდ მზა შედეგისთვის. თუ გენერაცია ვერ მოხერხდა, კრედიტი ბრუნდება.',
      'ყოველ ღილაკზე ფასი წინასწარ ჩანს. დამატებითი გადასახადი, ბარათის საკომისიო ან ფარული ლიმიტი არ არის.',
      'გამოწერის გაუქმება ნებისმიერ დროს შეიძლება, შემდეგი თვის გადახდა აღარ მოხდება.',
      'გადახდა საქართველოს ბანკის (BOG) დაცული გვერდით, ლარში.',
    ],
  },
  en: {
    title: 'Pricing',
    lead: 'One credit for every service: video, images, music, voice and a live avatar. The price you see is the price you pay.',
    month: '/month',
    credits: 'credits',
    perCredit: 'per credit',
    youGet: 'What you get (one of these, or any mix)',
    videos: '8 s videos (720p)',
    images: 'images (1K)',
    songs: 'songs',
    avatar: 'live avatar minutes',
    tts: 'read-aloud minutes',
    rollover: (m: number) => `Unused credits carry over ${m} month${m > 1 ? 's' : ''}`,
    free: 'Start free',
    choose: 'Choose',
    popular: 'Most popular',
    topupsTitle: 'Top up credits',
    topupsLead: 'One-time payment, no subscription. Top-up credits never expire.',
    bonus: 'bonus',
    buy: 'Buy',
    tableTitle: 'What each action costs',
    action: 'Action',
    unit: 'Unit',
    price: 'Credits',
    fairTitle: 'No hidden fees',
    fair: [
      'Credits are taken only for a finished result. If a generation fails, the credits come back.',
      'Every button shows its price before you press it. No extra tax, card fee or hidden limit.',
      'Cancel a plan any time and the next month is not charged.',
      'Payments go through Bank of Georgia’s secure page, in lari.',
    ],
  },
} as const;

const SERVICE: Record<ServiceId, { ka: string; en: string }> = {
  video: { ka: 'ვიდეო', en: 'Video' },
  image: { ka: 'სურათი', en: 'Images' },
  music: { ka: 'მუსიკა', en: 'Music' },
  voice: { ka: 'ხმა', en: 'Voice' },
  live: { ka: 'ლაივ ავატარი', en: 'Live avatar' },
  chat: { ka: 'ჩატი', en: 'Chat' },
};

const fmtGel = (n: number) => `${n % 1 === 0 ? n : n.toFixed(2)} ₾`;
const card = { border: '1px solid var(--pricing-contour-pop, rgba(255,255,255,0.12))', background: 'rgba(255,255,255,0.025)' } as const;

export function PricingV8({ locale }: { locale: string }) {
  const l: L = locale === 'ka' ? 'ka' : 'en';
  const t = T[l];
  const rows = priceList().filter((r) => USER_FACING_IDS.has(r.id));
  const byService = new Map<ServiceId, PriceRow[]>();
  for (const r of rows) byService.set(r.service, [...(byService.get(r.service) ?? []), r]);
  const signup = signInPath(locale, { mode: 'signup' });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20" style={{ color: 'var(--color-text)' }}>
      <header className="mx-auto max-w-2xl py-8 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">{t.title}</h1>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
          {t.lead}
        </p>
      </header>

      <section aria-label={t.title} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => {
          const w = whatYouGet(p.credits);
          return (
            <article key={p.id} className="relative flex flex-col rounded-2xl p-5" style={p.highlight ? { ...card, borderColor: 'rgb(var(--app-accent, 34 211 238))' } : card}>
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-semibold" style={{ background: 'rgb(var(--app-accent, 34 211 238))', color: 'rgb(var(--app-bg, 6 6 13))' }}>
                  {t.popular}
                </span>
              )}
              <h2 className="text-lg font-semibold">{p.name[l]}</h2>
              <p className="mt-2">
                <span className="text-3xl font-bold tabular-nums">{fmtGel(p.priceGel)}</span>
                {p.priceGel > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>{t.month}</span>}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {p.priceGel > 0 ? `≈ $${planUsd(p).toFixed(2)} · ${creditGelOf(p).toFixed(3)} ₾ ${t.perCredit}` : ' '}
              </p>
              <p className="mt-3 text-[15px] font-semibold tabular-nums">
                ✦ {p.credits.toLocaleString('en-US')} {t.credits}
              </p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                {t.youGet}
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px]">
                {[
                  [w.videos8s720, t.videos],
                  [w.images1k, t.images],
                  [w.songs, t.songs],
                  [w.avatarMinutes, t.avatar],
                  [w.ttsMinutes, t.tts],
                ].map(([n, label]) => (
                  <li key={String(label)}>
                    <span className="font-semibold tabular-nums">{n}</span> {label}
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                {p.perks.map((perk) => (
                  <li key={perk.en}>✓ {perk[l]}</li>
                ))}
                {p.rolloverMonths > 0 && <li>✓ {t.rollover(p.rolloverMonths)}</li>}
              </ul>
              <Link href={signup} data-iap-external className="mt-auto flex min-h-[48px] items-center justify-center rounded-xl text-[14px] font-semibold" style={{ ...card, marginTop: 16 }}>
                {p.priceGel > 0 ? `${t.choose} · ${fmtGel(p.priceGel)}` : t.free}
              </Link>
            </article>
          );
        })}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">{t.topupsTitle}</h2>
        <p className="mt-1 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
          {t.topupsLead}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOPUPS.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl p-4" style={card}>
              <div>
                <p className="text-lg font-bold tabular-nums">✦ {p.credits.toLocaleString('en-US')}</p>
                <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {p.bonusPct > 0 ? `+${p.bonusPct} % ${t.bonus}` : ' '}
                </p>
              </div>
              <Link href={signup} data-iap-external className="rounded-lg px-3 py-2 text-[14px] font-semibold" style={card}>
                {t.buy} · {fmtGel(p.priceGel)}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">{t.tableTitle}</h2>
        <div className="mt-4 overflow-x-auto rounded-xl" style={card}>
          <table className="w-full min-w-[480px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                <th className="px-4 py-2.5">{t.action}</th>
                <th className="px-4 py-2.5">{t.unit}</th>
                <th className="px-4 py-2.5 text-right">{t.price}</th>
                <th className="px-4 py-2.5 text-right">₾</th>
              </tr>
            </thead>
            {[...byService.entries()].map(([service, list]) => (
              <tbody key={service}>
                <tr>
                  <th colSpan={4} scope="colgroup" className="px-4 pb-1 pt-4 text-left text-[12px] font-semibold uppercase tracking-wide">
                    {SERVICE[service][l]}
                  </th>
                </tr>
                {list.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="px-4 py-2">{r.label[l]}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.unit[l]}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">✦ {r.credits}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                      {fmtGel(r.gel)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <section className="mt-12 rounded-2xl p-6" style={card}>
        <h2 className="text-xl font-semibold">{t.fairTitle}</h2>
        <ul className="mt-3 space-y-2 text-[14px]">
          {t.fair.map((line) => (
            <li key={line}>✓ {line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
