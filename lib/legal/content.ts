/**
 * lib/legal/content.ts — legal copy the PRODUCT shows (ka/en/ru), kept in one place so legal edits one file.
 *
 * ⚠️ IT STARTS WITH THE DIGITAL-TWIN BIOMETRIC CONSENT ONLY. The terms / privacy / refund pages still carry their own
 * copy (app/[locale]/{terms,privacy,refund}); moving them here is separate work.
 *
 * ⚠️ PLACEHOLDER — PENDING LEGAL REVIEW. The twin consent below is an engineering DRAFT. NEXT_PUBLIC_TWIN_ENABLED stays
 * off until legal replaces it, sets `status: 'approved'` and bumps `version`. Every twin manifest records the version the
 * person agreed to (lib/twin/store.ts), so a new version is a new consent and /api/twin/commit refuses a stale one.
 */

export type LegalLang = 'ka' | 'en' | 'ru';

/** The one locale resolver for legal copy. Falls back to ka (the middleware default), never to en. */
export function resolveLegalLang(locale: string | null | undefined): LegalLang {
  return locale === 'en' || locale === 'ru' ? locale : 'ka';
}

export interface ConsentDoc {
  /** Recorded in every manifest; bump it whenever the text changes. */
  version: string;
  status: 'draft-pending-legal-review' | 'approved';
  title: Record<LegalLang, string>;
  intro: Record<LegalLang, string>;
  points: Record<LegalLang, readonly string[]>;
  agree: Record<LegalLang, string>;
  /** Shown on the consent screen while `status` is a draft. */
  draftNotice: Record<LegalLang, string>;
}

export const TWIN_CONSENT: ConsentDoc = {
  version: '2026-10-02.draft',
  status: 'draft-pending-legal-review',
  title: {
    ka: 'თანხმობა ციფრული ტყუპის შექმნაზე',
    en: 'Consent to create your digital twin',
    ru: 'Согласие на создание цифрового двойника',
  },
  intro: {
    ka: 'ციფრული ტყუპის შესაქმნელად ვაგროვებთ ბიომეტრიულ მონაცემებს: შენი სახის სამ ფოტოს და შენი ხმის მოკლე ჩანაწერს.',
    en: 'To build your digital twin we collect biometric data: three photos of your face and a short recording of your voice.',
    ru: 'Чтобы создать вашего цифрового двойника, мы собираем биометрические данные: три фото вашего лица и короткую запись вашего голоса.',
  },
  points: {
    ka: [
      'რას ვიღებთ: შენს სახეს წინიდან, მარცხნიდან და მარჯვნიდან, და 12–30 წამიან ჩანაწერს, სადაც ეკრანზე ნაჩვენებ ციფრებს ხმამაღლა კითხულობ.',
      'როგორ ვინახავთ: დახურულად, მხოლოდ შენს ანგარიშთან დაკავშირებით. ის არასდროს ხდება საჯარო — ნახვა და გამოყენება მხოლოდ შენ შეგიძლია.',
      'რისთვის: მხოლოდ შენი ტყუპისთვის — მაგალითად, შენი მოლაპარაკე ფოტოსთვის — როცა ამას თავად ითხოვ. შენს ამოსაცნობად არ ვიყენებთ და არავის ვყიდით.',
      'როცა ტყუპს ვიდეოში იყენებ, ფოტო მხოლოდ იმ ვიდეოს შესაქმნელად გადაეცემა რენდერის პროვაიდერს.',
      'რამდენ ხანს: სანამ თავად არ წაშლი. წაშლა ნებისმიერ დროს შეგიძლია — იშლება ფოტოები, ხმის ჩანაწერი და შენი ძველი ცოცხალი ავატარის ფაილები.',
      'გადაიღე მხოლოდ საკუთარი თავი. გაგრძელებით ადასტურებ, რომ სახე და ხმა შენია, ხარ 18 წლის ან უფროსი და ეთანხმები შენი ბიომეტრიული მონაცემების ამგვარ დამუშავებას.',
    ],
    en: [
      'What we capture: your face from the front, left and right, and a 12–30 second recording of you reading the digits shown on screen aloud.',
      'How it is stored: privately, linked only to your account. It is never public — only you can view or use it.',
      'What it is for: only your own twin — for example a talking photo of you — when you ask for it. We do not use it to identify you and we never sell it.',
      'When you use your twin in a video, the photo is sent to the rendering provider for that video only.',
      'How long: until you delete it. You can delete it at any time — that removes the photos, the voice recording and your older Live Avatar files.',
      'Only capture yourself. By continuing you confirm the face and the voice are yours, you are 18 or older, and you agree to this processing of your biometric data.',
    ],
    ru: [
      'Что мы записываем: ваше лицо анфас, слева и справа и запись 12–30 секунд, где вы вслух читаете цифры с экрана.',
      'Как хранится: закрыто и привязано только к вашему аккаунту. Данные никогда не становятся публичными — видеть и использовать их можете только вы.',
      'Для чего: только для вашего двойника — например, говорящего фото — когда вы сами об этом просите. Мы не используем данные для вашей идентификации и никогда их не продаём.',
      'Когда вы используете двойника в видео, фото передаётся провайдеру рендеринга только для этого видео.',
      'Как долго: пока вы их не удалите. Удалить можно в любой момент — удаляются фото, запись голоса и ваши прежние файлы живого аватара.',
      'Снимайте только себя. Продолжая, вы подтверждаете, что лицо и голос принадлежат вам, вам 18 лет или больше и вы согласны на такую обработку ваших биометрических данных.',
    ],
  },
  agree: {
    ka: 'წავიკითხე და ვეთანხმები',
    en: 'I have read this and I agree',
    ru: 'Я прочитал(а) и согласен(на)',
  },
  draftNotice: {
    ka: 'პროექტი — იურიდიული განხილვის მოლოდინში',
    en: 'Draft — pending legal review',
    ru: 'Черновик — ожидает юридической проверки',
  },
};

/** The consent version a new twin must be committed under (/api/twin/commit compares it exactly). */
export const TWIN_CONSENT_VERSION = TWIN_CONSENT.version;
