// ========================================
// 30-DAY LAUNCH GTM SYSTEM
// ========================================

export interface Launch30Task {
  day: number;
  title: string;
  description: string;
  category: 'preparation' | 'content' | 'traffic' | 'conversion' | 'optimization';
  completed: boolean;
  contentPacks?: string[];
}

export interface Launch30Day {
  date: string;
  dayNumber: number;
  milestone: string;
  category: Launch30Task['category'];
  tasks: Launch30Task[];
  targetMetrics: {
    minViews?: number;
    minClicks?: number;
    minPurchases?: number;
  };
}

export interface Launch30Plan {
  storeId: string;
  language: 'en' | 'ka' | 'ru';
  startDate: string;
  endDate: string;
  days: Launch30Day[];
  goal: 'volume' | 'profit' | 'hybrid';
}

/**
 * Generate 30-day launch plan
 */
export function generateLaunch30Plan(args: {
  storeId: string;
  language: 'en' | 'ka' | 'ru';
  goal: 'volume' | 'profit' | 'hybrid';
  startDate?: string;
}): Launch30Plan {
  const start = new Date(args.startDate || new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 29);

  const plan: Launch30Plan = {
    storeId: args.storeId,
    language: args.language,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    goal: args.goal,
    days: [],
  };

  // Phase 1: Days 1-10 (Preparation & Foundation)
  for (let i = 1; i <= 10; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i - 1);

    const dayPhase = generatePhase1Day(i, date, args.language);
    plan.days.push(dayPhase);
  }

  // Phase 2: Days 11-20 (Content Launch & Traffic)
  for (let i = 11; i <= 20; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i - 1);

    const dayPhase = generatePhase2Day(i, date, args.language);
    plan.days.push(dayPhase);
  }

  // Phase 3: Days 21-30 (Optimization & Scale)
  for (let i = 21; i <= 30; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i - 1);

    const dayPhase = generatePhase3Day(i, date, args.language);
    plan.days.push(dayPhase);
  }

  return plan;
}

function generatePhase1Day(day: number, date: Date, language: string): Launch30Day {
  const dayLabels = {
    en: [
      'Store Setup & Legal',
      'Branding & Identity',
      'Product Photography',
      'Copywriting & SEO',
      'Payment Setup',
      'Fulfillment Planning',
      'Pricing Strategy',
      'Competitor Analysis',
      'Customer Support Setup',
      'Launch Checklist Review',
    ],
    ka: [
      'მაღაზიის დაყენება და იურ.',
      'ბრენდირება და იდენტიფიკაცია',
      'პროდუქტის ფოტოგრაფია',
      'კოპიწერიტინგი და SEO',
      'გადახდის დაყენება',
      'შევსების დაგეგმვა',
      'ფასის სტრატეგია',
      'კონკურენტების ანალიზი',
      'კლიენტის მხარდაჭერის დაყენება',
      'გამოშვების შემოწმების სია',
    ],
    ru: [
      'Установка магазина и юр.',
      'Брендирование и идентификация',
      'Фотография продукции',
      'Копирайтинг и SEO',
      'Настройка платежей',
      'Планирование исполнения',
      'Ценовая стратегия',
      'Анализ конкурентов',
      'Настройка поддержки клиентов',
      'Проверка контрольного списка запуска',
    ],
  };

  const labels = dayLabels[language as keyof typeof dayLabels] || dayLabels.en;
  const milestone = labels[day - 1] ?? labels[0] ?? 'Day milestone';
  const dayIso = date.toISOString().split('T')[0] ?? '';

  return {
    date: dayIso,
    dayNumber: day,
    milestone,
    category: 'preparation',
    tasks: [
      {
        day,
        title: milestone,
        description:
          'Complete today\'s ${day} of 30. Check the task list for detailed actions.',
        category: 'preparation',
        completed: false,
      },
    ],
    targetMetrics: {},
  };
}

function generatePhase2Day(day: number, date: Date, language: string): Launch30Day {
  const dayLabels = {
    en: [
      'TikTok Launch Campaign',
      'Instagram Reels Strategy',
      'Email List Building',
      'Influencer Outreach',
      'First Sales Campaign',
      'Customer Success Check-in',
      'Social Proof Collection',
      'Paid Ads Launch',
      'Analytics Review & Optimize',
      'Viral Content Experiment',
    ],
    ka: [
      'TikTok გამოშვების კამპანია',
      'Instagram Reels სტრატეგია',
      'ელ-ფოსტის სიის აგება',
      'ინფლუენსერთან დაკავშირება',
      'პირველი გაყიდვების კამპანია',
      'კლიენტის წარმატების შემოწმება',
      'სოციალური მტკიცებულების შეგროვება',
      'გადახდილი რეკლამის გამოშვება',
      'ანალიტიკის მიმოხილვა და ოპტიმიზაცია',
      'ვირალური კონტენტის ექსპერიმენტი',
    ],
    ru: [
      'Запуск кампании TikTok',
      'Стратегия Instagram Reels',
      'Создание списка адресов электронной почты',
      'Связь с инфлюэнсерами',
      'Первая кампания продаж',
      'Проверка успеха клиента',
      'Сбор социальных доказательств',
      'Запуск платной рекламы',
      'Проверка и оптимизация аналитики',
      'Эксперимент вирусного контента',
    ],
  };

  const labels = dayLabels[language as keyof typeof dayLabels] || dayLabels.en;
  const milestone = labels[day - 11] ?? labels[0] ?? 'Day milestone';
  const dayIso = date.toISOString().split('T')[0] ?? '';

  return {
    date: dayIso,
    dayNumber: day,
    milestone,
    category: 'content',
    tasks: [
      {
        day,
        title: milestone,
        description: 'Execute today\'s content and traffic strategy.',
        category: 'content',
        completed: false,
        contentPacks: [`content-pack-day-${day}`],
      },
    ],
    targetMetrics: {
      minViews: day * 100,
      minClicks: day * 10,
    },
  };
}

function generatePhase3Day(day: number, date: Date, language: string): Launch30Day {
  const dayLabels = {
    en: [
      'Double Down on Winners',
      'Customer Feedback Loop',
      'Product Improvements',
      'Retention Campaign',
      'Referral Program Launch',
      'Scale Top Channel',
      'B2B Partnerships Explore',
      'Loyalty Program Setup',
      'Final Push Marketing',
      'Launch Complete Review',
    ],
    ka: [
      'გამარჯვებულებზე დუბლირება',
      'კლიენტის უკუკავშირი',
      'პროდუქტის გაუმჯობესებები',
      'ღირებულების კამპანია',
      'რეფერალური პროგრამის გამოშვება',
      'ზედა არხის მასშტაბიანი დადგმა',
      'B2B პარტნიორობის კვლევა',
      'ლოიალობის პროგრამის დაყენება',
      'ფინალური მარკეტინგის შეფრთხვა',
      'გამოშვების სრული მიმოხილვა',
    ],
    ru: [
      'Удваивайте победителей',
      'Цикл обратной связи от клиентов',
      'Улучшения продукции',
      'Кампания по удержанию',
      'Запуск программы реферралов',
      'Масштабирование лучшего канала',
      'Исследование B2B партнерств',
      'Установка программы лояльности',
      'Окончательный маркетинговый толчок',
      'Полный обзор запуска',
    ],
  };

  const labels = dayLabels[language as keyof typeof dayLabels] || dayLabels.en;
  const milestone = labels[day - 21] ?? labels[0] ?? 'Day milestone';
  const dayIso = date.toISOString().split('T')[0] ?? '';

  return {
    date: dayIso,
    dayNumber: day,
    milestone,
    category: 'optimization',
    tasks: [
      {
        day,
        title: milestone,
        description: 'Focus on optimization and scaling what works.',
        category: 'optimization',
        completed: false,
      },
    ],
    targetMetrics: {
      minViews: 1000 + day * 50,
      minClicks: 100 + day * 5,
      minPurchases: Math.floor(day / 25),
    },
  };
}

/**
 * Calculate launch readiness percentage
 */
export function calculateLaunchReadiness(formFields: {
  storeName: boolean;
  productPhotos: boolean;
  pricing: boolean;
  paymentSetup: boolean;
  taxStatus: boolean;
  shippingRates: boolean;
}): number {
  const completed = Object.values(formFields).filter(Boolean).length;
  const total = Object.keys(formFields).length;
  return Math.round((completed / total) * 100);
}

/**
 * Get recommended next action based on plan progress
 */
export function getNextRecommendedAction(plan: Launch30Plan, completedDays: number): string {
  if (completedDays < 5) {
    return 'Complete store setup and branding tasks';
  }
  if (completedDays < 11) {
    return 'Finalize product photography and copywriting';
  }
  if (completedDays < 15) {
    return 'Launch first TikTok and Instagram content';
  }
  if (completedDays < 20) {
    return 'Run influencer outreach campaigns';
  }
  if (completedDays < 25) {
    return 'Analyze data and optimize winning channels';
  }
  return 'Scale successful campaigns and prepare for growth';
}
