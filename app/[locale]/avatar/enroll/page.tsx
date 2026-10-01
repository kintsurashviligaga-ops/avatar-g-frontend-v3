import { twinCopy } from '@/components/twin/copy';
import { requireUser } from '@/lib/supabase/server';
import { describeHandoffLink } from '@/lib/twin/account';
import { isTwinEnabled } from '@/lib/twin/flag';
import { twinHandoffJtiStore } from '@/lib/twin/store';
import MobileEnrollClient from './MobileEnrollClient';
import TwinEnrollClient from './TwinEnrollClient';

export const dynamic = 'force-dynamic';

/** The phone's own signed-in user, or null (signed out, or auth could not answer — the link then decides alone). */
async function phoneSessionUserId(): Promise<string | null> {
  try {
    return (await requireUser()).id;
  } catch {
    return null;
  }
}

function Message({ msg }: { msg: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-app-bg px-8 text-center">
      <p role="alert" className="max-w-sm text-[14px] leading-relaxed text-app-muted">{msg}</p>
    </div>
  );
}

/**
 * /{locale}/avatar/enroll?t=<token> — the phone lands here after scanning the desktop QR. No session
 * required: the enrollment is authorized by the signed handoff token in the query. An absent/blank token
 * shows a friendly "start again from your computer" message rather than a broken capture screen.
 *
 * With NEXT_PUBLIC_TWIN_ENABLED the phone runs the Digital Twin capture (components/twin/TwinCapture); with it off,
 * the Live Avatar selfie enrollment exactly as before.
 *
 * ⚠️ TWIN: THE LINK IS RESOLVED HERE, BEFORE ANY CAPTURE. The capture shows the masked account it saves to, and a phone
 * signed into a DIFFERENT account is refused with a clear message (sign out, or scan your own QR) — never a silent
 * cross-account save of someone's face (lib/twin/account.ts). An invalid, used or unresolvable link never opens the
 * camera.
 */
export default async function AvatarEnrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const loc = (['ka', 'en', 'ru'].includes(locale) ? locale : 'ka') as 'ka' | 'en' | 'ru';
  const token = typeof sp?.t === 'string' ? sp.t.trim() : '';
  const twin = isTwinEnabled();

  if (!token) {
    const msg = twin
      ? twinCopy(loc).linkInvalid
      : loc === 'en'
      ? 'This link is invalid or has expired. Start "Create Live Avatar" again from your computer.'
      : loc === 'ru'
        ? 'Ссылка недействительна или истекла. Запустите «Создать живой аватар» снова на компьютере.'
        : 'ბმული არასწორია ან ვადაგასულია. თავიდან დაიწყე „ცოცხალი ავატარის შექმნა" კომპიუტერიდან.';
    return <Message msg={msg} />;
  }

  if (!twin) return <MobileEnrollClient locale={loc} token={token} />;

  const t = twinCopy(loc);
  const link = await describeHandoffLink(token, { sessionUserId: await phoneSessionUserId(), store: () => twinHandoffJtiStore() });
  if (!link.ok) {
    return (
      <Message
        msg={
          link.reason === 'account_mismatch'
            ? t.err.accountMismatch
            : link.reason === 'used'
              ? t.err.link
              : link.reason === 'unavailable'
                ? t.err.unavailable
                : t.linkInvalid
        }
      />
    );
  }
  return <TwinEnrollClient locale={loc} token={token} account={link.account} />;
}
