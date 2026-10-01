import { twinCopy } from '@/components/twin/copy';
import { isTwinEnabled } from '@/lib/twin/flag';
import MobileEnrollClient from './MobileEnrollClient';
import TwinEnrollClient from './TwinEnrollClient';

export const dynamic = 'force-dynamic';

/**
 * /{locale}/avatar/enroll?t=<token> — the phone lands here after scanning the desktop QR. No session
 * required: the enrollment is authorized by the signed handoff token in the query. An absent/blank token
 * shows a friendly "start again from your computer" message rather than a broken capture screen.
 *
 * With NEXT_PUBLIC_TWIN_ENABLED the phone runs the Digital Twin capture (components/twin/TwinCapture); with it off,
 * the Live Avatar selfie enrollment exactly as before.
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
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-app-bg px-8 text-center">
        <p className="max-w-sm text-[14px] leading-relaxed text-app-muted">{msg}</p>
      </div>
    );
  }

  return twin ? <TwinEnrollClient locale={loc} token={token} /> : <MobileEnrollClient locale={loc} token={token} />;
}
