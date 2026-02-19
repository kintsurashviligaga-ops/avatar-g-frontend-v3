import type {
  BusinessAgentGoal,
  BusinessAgentMode,
  BusinessAgentPackInput,
  BusinessGeneratedPack,
} from '@/lib/business-agent/types';

const MODE_SUMMARY: Record<BusinessAgentMode, { en: string; ka: string }> = {
  sales_agent: {
    en: 'Focus on lead qualification and conversion scripts.',
    ka: 'ფოკუსი: ლიდების კვალიფიკაცია და კონვერსიის სკრიპტები.',
  },
  marketing_agent: {
    en: 'Focus on campaigns, offers, and awareness growth.',
    ka: 'ფოკუსი: კამპანიები, შეთავაზებები და ცნობადობის ზრდა.',
  },
  operations_agent: {
    en: 'Focus on SOPs, checklists, and process efficiency.',
    ka: 'ფოკუსი: SOP-ები, ჩეკლისტები და პროცესების ეფექტიანობა.',
  },
  support_agent: {
    en: 'Focus on customer replies, FAQ quality, and retention.',
    ka: 'ფოკუსი: მომხმარებელთა პასუხები, FAQ ხარისხი და retention.',
  },
  strategy_agent: {
    en: 'Focus on 90-day strategy and measurable growth KPIs.',
    ka: 'ფოკუსი: 90-დღიანი სტრატეგია და ზრდის KPI-ები.',
  },
};

const GOAL_LABELS: Record<BusinessAgentGoal, { en: string; ka: string }> = {
  get_clients: { en: 'Get clients', ka: 'კლიენტების მოზიდვა' },
  increase_sales: { en: 'Increase sales', ka: 'გაყიდვების ზრდა' },
  build_brand: { en: 'Build brand', ka: 'ბრენდის გაძლიერება' },
  automate_ops: { en: 'Automate ops', ka: 'ოპერაციების ავტომატიზაცია' },
  content_plan: { en: 'Content plan', ka: 'კონტენტ გეგმა' },
  customer_support: { en: 'Customer support', ka: 'მომხმარებელთა მხარდაჭერა' },
};

function uniqueGoals(goals: BusinessAgentGoal[]) {
  return Array.from(new Set(goals));
}

export function generateBusinessPack(input: BusinessAgentPackInput): BusinessGeneratedPack {
  const isEn = input.locale === 'en';
  const goals = uniqueGoals(input.goals);
  const goalNames = goals.map((goal) => GOAL_LABELS[goal][isEn ? 'en' : 'ka']).join(', ');
  const modeSummary = MODE_SUMMARY[input.mode][isEn ? 'en' : 'ka'];

  const businessName = input.profile.business_name || (isEn ? 'Your business' : 'თქვენი ბიზნესი');
  const category = input.profile.category || (isEn ? 'general services' : 'ზოგადი სერვისები');

  const summary = isEn
    ? `${businessName} positioning for ${category} in ${input.profile.location || 'local market'}. ${modeSummary}`
    : `${businessName}-ის პოზიციონირება კატეგორიაში ${category} ${input.profile.location || 'ლოკალურ ბაზარზე'}. ${modeSummary}`;

  return {
    offer_positioning: {
      summary,
      key_points: [
        isEn
          ? `Primary audience: ${input.profile.target_audience || 'city-based customers'}`
          : `ძირითადი აუდიტორია: ${input.profile.target_audience || 'ქალაქში მცხოვრები მომხმარებელი'}`,
        isEn
          ? `Offer model: ${input.profile.offer_type} | Price band: ${input.profile.price_range || 'mid-range'}`
          : `შეთავაზების მოდელი: ${input.profile.offer_type} | ფასის დიაპაზონი: ${input.profile.price_range || 'საშუალო'}`,
        isEn ? `Strategic goals: ${goalNames}` : `სტრატეგიული მიზნები: ${goalNames}`,
      ],
    },
    customer_persona: {
      primary_persona: isEn
        ? `${input.profile.target_audience || 'Busy professionals'} who need reliable ${category}`
        : `${input.profile.target_audience || 'დაკავებული პროფესიონალები'} ვისაც სჭირდება სანდო ${category}`,
      pain_points: isEn
        ? ['Low trust in providers', 'Inconsistent response time', 'Unclear pricing']
        : ['დაბალი ნდობა მიმწოდებლების მიმართ', 'არასტაბილური პასუხის დრო', 'არამკაფიო ფასები'],
      decision_triggers: isEn
        ? ['Clear value proposition', 'Fast first response', 'Visible social proof']
        : ['მკაფიო ღირებულების შეთავაზება', 'სწრაფი პირველი პასუხი', 'ხილული სოციალური მტკიცებულება'],
    },
    action_plan_30_day: {
      week_1: isEn
        ? [
            'Finalize offer wording and FAQ baseline',
            'Publish 3 introduction posts and one testimonial',
            'Set lead capture template for DM and website',
          ]
        : [
            'დააფიქსირე შეთავაზების ტექსტი და FAQ საბაზო ვერსია',
            'გამოაქვეყნე 3 გაცნობითი პოსტი და 1 ტესტიმონიალი',
            'დააყენე ლიდის მიღების შაბლონი DM/ვებსაიტისთვის',
          ],
      week_2: isEn
        ? [
            'Run one localized campaign with clear CTA',
            'Respond to every inbound lead under 15 minutes',
            'Collect objections and update scripts',
          ]
        : [
            'გაუშვი ერთი ლოკალური კამპანია მკაფიო CTA-ით',
            'უპასუხე ყველა ახალ ლიდს 15 წუთში',
            'შეაგროვე objections და განაახლე სკრიპტები',
          ],
      week_3: isEn
        ? [
            'Launch referral incentive for existing clients',
            'Test two offer bundles and compare conversion',
            'Create SOP for daily follow-up',
          ]
        : [
            'გაუშვი referral წახალისება არსებულ კლიენტებზე',
            'გატესტე ორი შეთავაზების პაკეტი და შეადარე კონვერსია',
            'შექმენი SOP ყოველდღიური follow-up-ისთვის',
          ],
      week_4: isEn
        ? [
            'Review KPIs and identify top-performing channel',
            'Scale winning campaign by 20% budget',
            'Prepare next 30-day content and sales plan',
          ]
        : [
            'გადაამოწმე KPI-ები და გამოავლინე საუკეთესო არხი',
            'გააზარდე გამარჯვებული კამპანიის ბიუჯეტი 20%-ით',
            'მოამზადე შემდეგი 30-დღიანი კონტენტ/გაყიდვების გეგმა',
          ],
    },
    scripts: {
      dm_script: isEn
        ? `Hi! Thanks for reaching out to ${businessName}. Based on your need, I can suggest our best ${input.profile.offer_type} option in 2 steps. What is your target timeline?`
        : `გამარჯობა! მადლობა რომ მოგვწერეთ ${businessName}-ს. თქვენს მოთხოვნაზე დაყრდნობით 2 ნაბიჯში შემოგთავაზებთ საუკეთესო ${input.profile.offer_type} ვარიანტს. რა ვადაში გჭირდებათ?`,
      call_script: isEn
        ? `Thanks for your time. I will quickly confirm your goal, budget range, and expected result, then share the most suitable offer and next step today.`
        : `მადლობა დროისთვის. სწრაფად დავაზუსტებ თქვენს მიზანს, ბიუჯეტის დიაპაზონს და სასურველ შედეგს, შემდეგ კი დღესვე შემოგთავაზებთ შესაბამის შეთავაზებას და შემდეგ ნაბიჯს.`,
      email_script: isEn
        ? `Subject: Your tailored plan from ${businessName}\n\nHello,\nHere is your tailored offer based on our conversation, including scope, timeline, and expected outcome. Reply with “Approve” to start this week.`
        : `თემა: თქვენზე მორგებული გეგმა ${businessName}-სგან\n\nგამარჯობა,\nგიგზავნით თქვენზე მორგებულ შეთავაზებას ჩვენი საუბრის მიხედვით: მოცულობა, ვადები და მოსალოდნელი შედეგი. უპასუხეთ „დამტკიცება“-ით და ამ კვირაში დავიწყებთ.`,
    },
    content_ideas: [
      isEn ? 'Before/after transformation story' : '„სანამ/შემდეგ“ ტრანსფორმაციის ისტორია',
      isEn ? 'Client objection of the week + answer' : 'კვირის objection + პასუხი',
      isEn ? 'Behind-the-scenes process walkthrough' : 'კულისების მიღმა პროცესის walkthrough',
      isEn ? 'FAQ short video with clear CTA' : 'FAQ მოკლე ვიდეო მკაფიო CTA-ით',
    ],
    kpi_dashboard_suggestions: [
      isEn ? 'Lead response time (minutes)' : 'ლიდზე პასუხის დრო (წუთები)',
      isEn ? 'Qualified leads per week' : 'კვირაში კვალიფიციური ლიდები',
      isEn ? 'Offer-to-sale conversion rate' : 'შეთავაზება→გაყიდვის კონვერსია',
      isEn ? 'Average order value / deal size' : 'საშუალო შეკვეთა / deal ზომა',
      isEn ? 'Customer support resolution time' : 'მომხმარებლის საკითხის დახურვის დრო',
    ],
  };
}
