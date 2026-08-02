'use client';

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

/**
 * The header for a legal document opened from inside the app — a title and a close ✕, nothing else.
 *
 * ⚠️ THESE PAGES USED TO OPEN UNDERNEATH THE APP'S OWN CHROME. Tapping "თანხის დაბრუნების პოლიტიკა" in
 * the billing sheet landed you on a full marketing page: the fixed bottom nav sat ON TOP of the last
 * paragraph, the top bar offered "დაწყება" to someone who was already mid-payment, and the way back was
 * a link at the very bottom of a long document. Reported as "it opens wrong, the bars collide with the
 * content".
 *
 * A legal document is something you OPEN, READ and CLOSE — it is not a destination in the product's
 * navigation. So AppShell strips every bar on these routes (isLegalDoc) and this is the only control:
 * one ✕, top-right, always reachable because the bar is sticky.
 *
 * ⚠️ `router.back()` WITH A HARD FALLBACK. Reached by a direct link, a share, or a search result, there
 * is no history entry to go back to and `back()` silently does nothing — the ✕ would look broken. When
 * this page is the first entry, the ✕ goes to the product instead.
 */
export function LegalDocChrome({ title, locale }: { title: string; locale: string }) {
  const router = useRouter();

  const close = () => {
    // history.length === 1 means we ARE the entry point; there is nothing behind us.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(`/${locale}/dashboard`);
  };

  const label = locale === 'en' ? 'Close' : locale === 'ru' ? 'Закрыть' : 'დახურვა';

  return (
    <div
      className="sticky top-0 z-30 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"
      style={{ backgroundColor: 'rgba(6,6,13,0.88)', paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
    >
      <span className="truncate text-[14px] font-semibold text-white/90">{title}</span>
      <button
        type="button"
        onClick={close}
        aria-label={label}
        // 44px hit target: this is the ONLY way out of the document now.
        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
      >
        <X size={20} />
      </button>
    </div>
  );
}

export default LegalDocChrome;
