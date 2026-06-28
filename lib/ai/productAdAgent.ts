/**
 * lib/ai/productAdAgent.ts
 * ========================
 * Pure helpers for the Product-Ad flow — no network, no deps (safe to import on the
 * client). The actual voiceover TTS + price/CTA overlays are done by the EXISTING
 * server infra (filmVoiceover.textToHostedSpeech via the assemble route's voiceoverScript,
 * and lib/pipeline/compositing/ffmpeg-overlay MarketingOverlay) — this file only builds
 * the copy that feeds them.
 */

export type ProductCtaOption = 'shop_now' | 'book_now' | 'learn_more' | 'order_now' | 'try_free' | 'custom';

const CTA_TEXT: Record<Exclude<ProductCtaOption, 'custom'>, { ka: string; en: string; ru: string }> = {
  shop_now: { ka: 'იყიდე ახლავე', en: 'Shop Now', ru: 'Купить' },
  book_now: { ka: 'დაჯავშნე', en: 'Book Now', ru: 'Забронировать' },
  learn_more: { ka: 'გაიგე მეტი', en: 'Learn More', ru: 'Узнать больше' },
  order_now: { ka: 'შეუკვეთე', en: 'Order Now', ru: 'Заказать' },
  try_free: { ka: 'სცადე უფასოდ', en: 'Try Free', ru: 'Попробовать' },
};

/** Resolve a CTA option (+ custom text) to the display string in the given locale. */
export function productCtaText(option: ProductCtaOption, custom: string, locale: string): string {
  if (option === 'custom') return custom.trim();
  const lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  return CTA_TEXT[option][lang];
}

export interface ProductAdCopy {
  brandName?: string;
  productPrice?: string;
  productHook?: string;
  ctaText?: string;
  locale?: string;
}

/**
 * A short, punchy ad voiceover script from the brand context. Deterministic (no LLM) so
 * it always returns usable copy; the assemble route TTSes it on the cloned KA voice.
 */
export function generateVoiceoverScript(c: ProductAdCopy): string {
  const lang = c.locale === 'en' ? 'en' : c.locale === 'ru' ? 'ru' : 'ka';
  const only = lang === 'en' ? 'Only' : lang === 'ru' ? 'Всего' : 'მხოლოდ';
  return [
    c.productHook?.trim() ? `${c.productHook.trim()}.` : '',
    c.brandName?.trim() ? `${c.brandName.trim()}.` : '',
    c.productPrice?.trim() ? `${only} ${c.productPrice.trim()}.` : '',
    c.ctaText?.trim() ? `${c.ctaText.trim()}!` : '',
  ].filter(Boolean).join(' ').trim();
}
