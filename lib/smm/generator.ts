import type { SmmGeneratedPost, SmmPlanInput } from '@/lib/smm/types';

const GOAL_HEADLINES: Record<SmmPlanInput['goal'], string[]> = {
  grow_followers: [
    '7 გზა სწრაფი ზრდისთვის',
    'რატომ გდევნიან საუკეთესო ბრენდებს',
    'დღის რჩევა: მეტი ჩართულობა 15 წუთში',
  ],
  sell_product: [
    'პროდუქტის ღირებულება 3 მიზეზში',
    'შეადარე: ძველი vs ახალი შედეგი',
    'დღის შეთავაზება შეზღუდული დროით',
  ],
  build_brand: [
    'ჩვენი ბრენდის ისტორია 60 წამში',
    'რატომ გვირჩევენ კლიენტები',
    'ბრენდის ხმა: რას ვპირდებით',
  ],
  announce_event: [
    'ღონისძიების ოფიციალური ანონსი',
    'რას მიიღებ ღონისძიებაზე',
    'მომხსენებლები და მთავარი თემები',
  ],
  recruit: [
    'ვეძებთ ახალ წევრს გუნდში',
    'სამუშაოს უპირატესობები',
    'ვის ვეძებთ ზუსტად?',
  ],
  tourism_promo: [
    'აღმოაჩინე საქართველოს ფარული ადგილები',
    '3 დღე დაუვიწყარი მარშრუტით',
    'რატომ მოგზაურობენ ჩვენთან ერთად',
  ],
};

const VOICE_STYLE: Record<SmmPlanInput['brandVoice'], string> = {
  luxury: 'დახვეწილი, პრემიუმ და თავდაჯერებული ტონი',
  friendly: 'თბილი, ადამიანური და მარტივად გასაგები ტონი',
  corporate: 'პროფესიონალური, ზუსტი და სანდო ტონი',
  noir: 'დრამატული, ელეგანტური და ატმოსფერული ტონი',
  energetic: 'ენერგიული, თამამი და მოქმედებაზე ორიენტირებული ტონი',
};

const LANG_CTA: Record<SmmPlanInput['audienceLang'], string> = {
  ka: 'დაწერე “მინდა” კომენტარში და გაგიზიარებთ გეგმას.',
  en: 'Comment “Start” and we will send you the full plan.',
  ru: 'Напишите “Старт” в комментариях и получите план.',
};

export function generateSmmPlan(input: SmmPlanInput): SmmGeneratedPost[] {
  const headlines = GOAL_HEADLINES[input.goal];
  const cadence = input.timeframeDays <= 7 ? 1 : input.timeframeDays <= 14 ? 2 : 4;
  const plannedCount = Math.max(3, Math.floor(input.timeframeDays / cadence));
  const posts: SmmGeneratedPost[] = [];

  for (let index = 0; index < plannedCount; index += 1) {
    const dayIndex = Math.min(input.timeframeDays, index * cadence + 1);
    const headline = headlines[index % headlines.length];
    const primaryPlatform = input.platforms[index % Math.max(1, input.platforms.length)] || 'instagram';

    posts.push({
      day_index: dayIndex,
      title: `${headline} • ${input.persona}`,
      hook: `${headline} — ${VOICE_STYLE[input.brandVoice]}`,
      caption: [
        `პლატფორმა: ${primaryPlatform}`,
        `აუდიტორია: ${input.audienceLang.toUpperCase()}`,
        `პერსონა: ${input.persona}`,
        LANG_CTA[input.audienceLang],
      ].join(' | '),
      hashtags: [
        '#avatarG',
        '#socialmedia',
        `#${input.goal}`.replace(/_/g, ''),
        `#${primaryPlatform}`,
      ],
      status: 'planned',
      scheduled_at: null,
    });
  }

  return posts;
}

export function fallbackSmmTemplates(): SmmGeneratedPost[] {
  return [
    {
      day_index: 1,
      title: 'ბრენდის გაცნობითი პოსტი',
      hook: 'გაიცანით ჩვენი პროდუქტი მარტივად',
      caption: 'მოკლე გაცნობითი პოსტი + CTA კომენტარისთვის',
      hashtags: ['#brand', '#intro', '#avatarG'],
      status: 'planned',
      scheduled_at: null,
    },
    {
      day_index: 3,
      title: 'სასარგებლო რჩევა აუდიტორიისთვის',
      hook: 'ერთი რჩევა, რომელიც დღესვე მუშაობს',
      caption: 'საგანმანათლებლო პოსტი + save/share CTA',
      hashtags: ['#tips', '#growth', '#social'],
      status: 'planned',
      scheduled_at: null,
    },
    {
      day_index: 5,
      title: 'ქეისი ან რეალური შედეგი',
      hook: 'ნახე შედეგი სანამ/მას შემდეგ',
      caption: 'რეალური მაგალითი სანდოობის ასამაღლებლად',
      hashtags: ['#case', '#results', '#marketing'],
      status: 'planned',
      scheduled_at: null,
    },
  ];
}
