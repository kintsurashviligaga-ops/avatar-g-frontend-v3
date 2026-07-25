import MobileEnrollClient from './MobileEnrollClient';

export const dynamic = 'force-dynamic';

/**
 * /{locale}/avatar/enroll?t=<token> — the phone lands here after scanning the desktop QR. No session
 * required: the enrollment is authorized by the signed handoff token in the query. An absent/blank token
 * shows a friendly "start again from your computer" message rather than a broken capture screen.
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

  if (!token) {
    const msg = loc === 'en'
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

  return <MobileEnrollClient locale={loc} token={token} />;
}
