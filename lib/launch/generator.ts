/**
 * Launch plan generator - 90-day (12-week) plan
 */

export interface LaunchPlanWeek {
  week: number;
  focus: string;
  actions: string[];
  content_templates: string[];
  kpis: string[];
}

export interface LaunchPlan {
  store_id: string;
  language: string;
  generated_at: string;
  founders_program: {
    goal: string;
    incentives: string[];
    tracking: string[];
  };
  influencer_outreach_templates: string[];
  content_plan_templates: string[];
  kpi_tracker_fields: string[];
  weeks: LaunchPlanWeek[];
}

function buildWeek(week: number): LaunchPlanWeek {
  const focusMap: Record<number, string> = {
    1: 'Market validation and offer clarity',
    2: 'Brand story and trust signals',
    3: 'Initial content production sprint',
    4: 'Soft launch and early feedback',
    5: 'Paid traffic tests and optimization',
    6: 'Influencer outreach and UGC',
    7: 'Conversion rate optimization',
    8: 'Scale winning creatives',
    9: 'Affiliate recruitment push',
    10: 'Referral loop activation',
    11: 'Retention and repeat purchases',
    12: 'Scale plan and automation review',
  };

  return {
    week,
    focus: focusMap[week] || 'Growth execution',
    actions: [
      'Publish 3-5 short-form videos with clear CTA',
      'Run A/B pricing test on top 3 products',
      'Collect 10 customer quotes for social proof',
    ],
    content_templates: [
      'Hook: "Why 90% of [niche] fail" -> Solution -> CTA',
      'Before/After: problem vs outcome montage',
      'Founder story: 30s origin + mission',
    ],
    kpis: ['views', 'clicks', 'conversion_rate', 'cac', 'revenue'],
  };
}

export function generateLaunchPlan(storeId: string, language = 'en'): LaunchPlan {
  const weeks: LaunchPlanWeek[] = Array.from({ length: 12 }).map((_, i) => buildWeek(i + 1));

  return {
    store_id: storeId,
    language,
    generated_at: new Date().toISOString(),
    founders_program: {
      goal: 'Acquire first 100 loyal customers in 90 days',
      incentives: [
        'Founders discount: 20% off first order',
        'Bonus gift for first 50 customers',
        'VIP early access to new drops',
      ],
      tracking: ['referral_code', 'purchase_count', 'repeat_rate'],
    },
    influencer_outreach_templates: [
      'Hi {name}, we are launching a Georgian-first AI shop. Can we send you a sample for a 30s review?',
      'Hello {name}, your content fits our niche. We can offer an affiliate deal + free product. Interested?',
      'Hey {name}, we are building a new marketplace. Want to collaborate on a launch reel this week?',
    ],
    content_plan_templates: [
      'TikTok: 15s problem -> solution -> product demo',
      'Reels: 20s transformation story + CTA',
      'Shorts: 30s expert tip + product plug',
    ],
    kpi_tracker_fields: ['views', 'clicks', 'conversions', 'cac', 'revenue', 'repeat_rate'],
    weeks,
  };
}

export function generateLaunchMarkdown(plan: LaunchPlan): string {
  const lines: string[] = [];
  lines.push(`# 90-Day Launch Plan`);
  lines.push(`Store: ${plan.store_id}`);
  lines.push(`Generated: ${plan.generated_at}`);
  lines.push('');
  lines.push('## Founders Program');
  lines.push(`Goal: ${plan.founders_program.goal}`);
  lines.push('Incentives:');
  plan.founders_program.incentives.forEach((i) => lines.push(`- ${i}`));
  lines.push('');
  lines.push('## Influencer Outreach Templates');
  plan.influencer_outreach_templates.forEach((t) => lines.push(`- ${t}`));
  lines.push('');
  lines.push('## Content Plan Templates');
  plan.content_plan_templates.forEach((t) => lines.push(`- ${t}`));
  lines.push('');
  lines.push('## Weekly Plan');
  plan.weeks.forEach((week) => {
    lines.push(`### Week ${week.week}: ${week.focus}`);
    lines.push('Actions:');
    week.actions.forEach((a) => lines.push(`- ${a}`));
    lines.push('Content Templates:');
    week.content_templates.forEach((c) => lines.push(`- ${c}`));
    lines.push('KPIs:');
    week.kpis.forEach((k) => lines.push(`- ${k}`));
    lines.push('');
  });

  return lines.join('\n');
}
