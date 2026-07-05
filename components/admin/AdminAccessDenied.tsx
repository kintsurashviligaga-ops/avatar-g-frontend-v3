'use client';

/**
 * AdminAccessDenied — shown by app/[locale]/admin/page.tsx when a user IS signed in but their email is not
 * on the admin allowlist (and app_metadata carries no admin role). It does NOT bounce to the consumer
 * dashboard (which hid the fact that the wrong account was signed in) and it does NOT show the login form
 * (there is already a session). Instead it states plainly whose session is active and offers Log out — so
 * the operator can switch to an authorized account — plus a link back to the app.
 */
import { BrandLogo } from '@/components/ui/BrandLogo';
import AdminSignOutButton from '@/components/admin/AdminSignOutButton';

export default function AdminAccessDenied({ locale, email }: { locale: string; email: string | null }) {
  const ka = locale === 'ka';
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#06060d] px-4 py-10 text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo href={`/${locale}/dashboard`} size="nav" />
          <div className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-[17px] font-semibold text-white">{ka ? 'ადმინ წვდომა შეზღუდულია' : 'Admin access restricted'}</h1>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-500">
              {ka
                ? 'ეს ანგარიში ვერ იძენს ადმინ პანელზე წვდომას. გამოდით და შედით ავტორიზებული ანგარიშით.'
                : 'This account is not authorized for the admin panel. Log out and sign in with an authorized account.'}
            </p>
          </div>
        </div>

        {email && (
          <p className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-gray-400">
            {ka ? 'ავტორიზებული:' : 'Signed in as:'} <span className="font-medium text-gray-200">{email}</span>
          </p>
        )}

        <div className="flex items-center justify-center gap-2.5">
          <AdminSignOutButton
            locale={locale}
            className="rounded-lg bg-white/10 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50"
          />
          <a href={`/${locale}/dashboard`} className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
            {ka ? 'აპლიკაცია' : 'Go to app'}
          </a>
        </div>
      </div>
    </main>
  );
}
