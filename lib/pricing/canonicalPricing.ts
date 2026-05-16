// Canonical pricing config for Avatar G
// Georgian market: GEL (₾) pricing
// All plans, prices, and features are defined here and imported by all pricing components

export type PricingPlan = {
  id: string;
  name: string;
  nameKa: string;
  price: number;        // GEL price/month
  priceDisplay: string; // formatted with ₾ symbol
  currency: 'GEL';
  monthly: true;
  description: string;
  descriptionKa: string;
  features: string[];
  featuresKa: string[];
  dailyLimit: number;   // max generations per day (0 = unlimited)
  monthlyCredits: number;
  cta: string;
  ctaKa: string;
  popular: boolean;
  gradient: string;
  badge?: string;
  badgeKa?: string;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    nameKa: 'სტარტერი',
    price: 0,
    priceDisplay: 'უფასო',
    currency: 'GEL',
    monthly: true,
    description: 'For exploration and getting started with AI creation.',
    descriptionKa: 'AI შემოქმედებასთან გასაცნობად.',
    features: [
      '200 credits/month',
      '50 generations/day limit',
      '5 image generations',
      '3 music tracks',
      '2 voice clips',
      'Basic chat (Gemini Flash)',
      'Community support',
    ],
    featuresKa: [
      '200 კრედიტი/თვეში',
      '50 გენერაცია/დღეში (ლიმიტი)',
      '5 სურათი',
      '3 მუსიკალური ტრეკი',
      '2 ხმოვანი კლიპი',
      'ბაზისური ჩატი (Gemini Flash)',
      'Community Support',
    ],
    dailyLimit: 50,
    monthlyCredits: 200,
    cta: 'Get Started Free',
    ctaKa: 'დაიწყე უფასოდ',
    popular: false,
    gradient: 'from-slate-500 to-slate-600',
  },
  {
    id: 'pro',
    name: 'Pro',
    nameKa: 'Pro',
    price: 9,
    priceDisplay: '₾9',
    currency: 'GEL',
    monthly: true,
    description: 'For creators who generate content daily.',
    descriptionKa: 'ყოველდღიური კონტენტის შემქმნელებისთვის.',
    features: [
      '500 credits/month',
      'Unlimited generations/day',
      '50 image generations',
      'Unlimited music tracks',
      '20 voice clips',
      'Avatar G chat (Gemini Pro)',
      'Priority generation',
      'Email support',
      'Gallery + Share links',
    ],
    featuresKa: [
      '500 კრედიტი/თვეში',
      'შეუზღუდავი გენერაციები/დღეში',
      '50 სურათი',
      'შეუზღუდავი მუსიკა',
      '20 ხმოვანი კლიპი',
      'Avatar G ჩატი (Gemini Pro)',
      'პრიორიტეტული გენერაცია',
      'Email Support',
      'გალერეა + საზოგადო ბმულები',
    ],
    dailyLimit: 0,
    monthlyCredits: 500,
    cta: 'Start Pro',
    ctaKa: 'Pro-ს დაწყება',
    popular: false,
    gradient: 'from-violet-500 to-purple-600',
    badge: 'Great Value',
    badgeKa: 'მაქსიმალური ღირებულება',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    nameKa: 'Ultimate',
    price: 29,
    priceDisplay: '₾29',
    currency: 'GEL',
    monthly: true,
    description: 'For serious creators and businesses with high volume needs.',
    descriptionKa: 'სერიოზული შემქმნელებისა და ბიზნესებისთვის.',
    features: [
      '2,000 credits/month',
      'Unlimited everything',
      'Unlimited images + batch ×4',
      'Unlimited music + video',
      'Unlimited voice clones',
      'Agent G pipeline (multi-step)',
      'Character references (@mention)',
      'Export Pack (ZIP downloads)',
      'Admin analytics dashboard',
      'Priority + Slack support',
    ],
    featuresKa: [
      '2,000 კრედიტი/თვეში',
      'ყველაფერი შეუზღუდავი',
      'შეუზღუდავი სურათები + Batch ×4',
      'შეუზღუდავი მუსიკა + ვიდეო',
      'შეუზღუდავი ხმის კლონირება',
      'Agent G pipeline (მრავალ-საფეხუროვანი)',
      'Character references (@mention)',
      'Export Pack (ZIP ჩამოტვირთვა)',
      'Admin Analytics Dashboard',
      'Priority + Slack Support',
    ],
    dailyLimit: 0,
    monthlyCredits: 2000,
    cta: 'Go Ultimate',
    ctaKa: 'Ultimate-ზე გადასვლა',
    popular: true,
    gradient: 'from-amber-500 to-orange-600',
    badge: 'Most Popular',
    badgeKa: 'ყველაზე პოპულარული',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameKa: 'Enterprise',
    price: 89,
    priceDisplay: '₾89',
    currency: 'GEL',
    monthly: true,
    description: 'For organizations needing dedicated capacity and custom integrations.',
    descriptionKa: 'ორგანიზაციებისთვის, რომლებიც საჭიროებენ custom ინტეგრაციას.',
    features: [
      '10,000 credits/month',
      'Dedicated priority queue',
      'API access',
      'White-label options',
      'Custom avatar + voice training',
      'Multi-user team workspace',
      'Custom integrations',
      'SLA + dedicated support',
    ],
    featuresKa: [
      '10,000 კრედიტი/თვეში',
      'Dedicated Priority Queue',
      'API წვდომა',
      'White-label ოფცია',
      'Custom avatar + ხმის ტრენინგი',
      'Multi-user გუნდის სამუშაო სივრცე',
      'Custom ინტეგრაციები',
      'SLA + Dedicated Support',
    ],
    dailyLimit: 0,
    monthlyCredits: 10000,
    cta: 'Contact Sales',
    ctaKa: 'გაყიდვებთან დაკავშირება',
    popular: false,
    gradient: 'from-cyan-500 to-blue-600',
  },
];

// Helper: get plan by ID
export function getPlanById(id: string): PricingPlan | undefined {
  return PRICING_PLANS.find(p => p.id === id);
}

// Helper: get daily limit for a plan (0 = unlimited)
export function getDailyLimit(planId: string): number {
  return getPlanById(planId)?.dailyLimit ?? 50;
}
