// ========================================
// GTM CONTENT TEMPLATES
// ========================================

export interface ContentTemplate {
  id: string;
  day: number;
  language: 'en' | 'ka' | 'ru';
  type: 'tiktok_script' | 'instagram_hook' | 'caption' | 'dm_template';
  title: string;
  content: string;
  tips?: string[];
  hashtags?: string[];
}

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  // ========================================
  // TIKTOK SCRIPTS (Days 11-20)
  // ========================================
  {
    id: 'tiktok-day-11-en',
    day: 11,
    language: 'en',
    type: 'tiktok_script',
    title: 'First Product Launch Hook',
    content: `[Hook - 0-3 sec]
"POV: You just found your new favorite store online 😍"

[Problem - 3-7 sec]
"Tired of boring, expensive products? We're different...

[Solution - 7-12 sec]
Show product in action, smiling using it

[CTA - 12-15 sec]
"Link in bio to shop now 🔗"`,
    tips: [
      'Hook viewers in first 3 seconds',
      'Show product in real use',
      'Use trending audio',
      'Keep energy high',
    ],
    hashtags: ['#ProductLaunch', '#NewStore', '#ShopSmall', '#MadeInGeorgia'],
  },
  {
    id: 'tiktok-day-11-ka',
    day: 11,
    language: 'ka',
    type: 'tiktok_script',
    title: 'პირველი პროდუქტის გამოშვების ჰუქი',
    content: `[უკვე - 0-3 წ]
"POV: ახლახან იპოვე თენი ცხელი სახელმწიფო მაღაზია ონლაინ 😍"

[პრობლემა - 3-7 წ]
"მოიწყინე მოსაბეზრებელი, ძვირი პროდუქტებისგან?

[გამოსავალი - 7-12 წ]
აჩვენე პროდუქტი რეალური გამოყენებაში

[CTA - 12-15 წ]
"ბიოში ბმული ახლა აკეთებს 🔗"`,
    tips: [
      'ხელამოწერელი პირველი 3 წამი',
      'აჩვენე ცხელი პროდუქტი',
      'გამოიყენე იმ ტრენდის აუდიო',
      'დაზრუნე ზეწოხ სიმძლავრე',
    ],
    hashtags: ['#პროდუქტიშუა', '#ახალი_საარდო', '#ყიდვა_პატარა'],
  },
  {
    id: 'tiktok-day-11-ru',
    day: 11,
    language: 'ru',
    type: 'tiktok_script',
    title: 'Крючок первого запуска продукта',
    content: `[Крючок - 0-3 сек]
"POV: Вы только что нашли свой новый любимый магазин в Интернете 😍"

[Проблема - 3-7 сек]
"Устали от скучных, дорогих продуктов?

[Решение - 7-12 сек]
Показать продукт в действии, улыбающихся при его использовании

[CTA - 12-15 сек]
"Ссылка в биографии, чтобы купить сейчас 🔗"`,
    tips: [
      'Зацепляйте зрителей в первые 3 секунды',
      'Покажите продукт в реальном использовании',
      'Используйте популярный звук',
      'Держите энергию высокой',
    ],
    hashtags: ['#ЗапускПродукта', '#НовыйМагазин', '#ПокупайМалое'],
  },

  // ========================================
  // INSTAGRAM REELS HOOKS (Days 12-15)
  // ========================================
  {
    id: 'instagram-day-12-en',
    day: 12,
    language: 'en',
    type: 'instagram_hook',
    title: 'Problem-Solution Hook',
    content: `✋ STOP Buying Expensive Products

👉 We Found The Solution

🎯 [Your Product] Does [Key Benefit] Better

💰 For Less Than You Think

🛍️ Link In Bio - First 50 Orders Get 20% Off`,
    tips: [
      'Use emojis to break up text',
      'Lead with problem, end with solution',
      'Create urgency with "First 50"',
      'Make offer time-limited',
    ],
    hashtags: ['#ShoppingDeal', '#ProductLaunch', '#OnlineStore'],
  },

  // ========================================
  // INFLUENCER DM TEMPLATES (Days 13-14)
  // ========================================
  {
    id: 'dm-influencer-en',
    day: 13,
    language: 'en',
    type: 'dm_template',
    title: 'Micro-Influencer Collaboration',
    content: `Hi [Name]! 👋

I love your content about [specific thing they post about]. 

We just launched [your product] and I think your audience would genuinely love it. 

Would you be interested in a collaboration? We'd love to send you a product and offer a discount code for your followers.

No pressure - let me know! 🙌

Thanks,
[Your Name]
[Your Store]`,
    tips: [
      'Personalize with their name and content niche',
      'Comment on 5-10 of their posts first',
      'Keep it short and friendly',
      'Offer value (free product + affiliate).',
    ],
  },

  // ========================================
  // CAPTION TEMPLATES (Days 16-20)
  // ========================================
  {
    id: 'caption-day-16-en',
    day: 16,
    language: 'en',
    type: 'caption',
    title: 'Customer Testimonial Caption',
    content: `🌟 "I've never found anything like this before!" - Sarah

From day one, we've been obsessed with quality. Every [product] is handpicked and tested.

Because you deserve better. 💚

Not sure where to start? 
→ Start with our bestsellers (link in bio)

What would you add to your collection?`,
    tips: [
      'Share real customer quotes',
      'Explain product philosophy',
      'Add a call-to-action',
      'Ask question to boost engagement',
    ],
  },
];

/**
 * Get content template by day and language
 */
export function getContentTemplate(
  day: number,
  language: 'en' | 'ka' | 'ru',
  type?: string
): ContentTemplate | null {
  return (
    CONTENT_TEMPLATES.find(
      (t) => t.day === day && t.language === language && (!type || t.type === type)
    ) || null
  );
}

/**
 * Get all templates for a language
 */
export function getAllTemplates(language: 'en' | 'ka' | 'ru'): ContentTemplate[] {
  return CONTENT_TEMPLATES.filter((t) => t.language === language);
}

/**
 * Generate daily content pack
 */
export function generateDailyContentPack(day: number, language: 'en' | 'ka' | 'ru') {
  return {
    day,
    tiktokScript: getContentTemplate(day, language, 'tiktok_script'),
    instagramHook: getContentTemplate(day, language, 'instagram_hook'),
    dmTemplate: getContentTemplate(day, language, 'dm_template'),
    caption: getContentTemplate(day, language, 'caption'),
  };
}
