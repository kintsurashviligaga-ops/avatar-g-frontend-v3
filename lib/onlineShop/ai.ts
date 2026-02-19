import type {
  AnalyzeProductInput,
  AnalyzeProductResult,
  PricingRecommendation,
  PricingRules,
  Product,
  RiskAssessment,
} from './types';

export function analyzeProduct(input: AnalyzeProductInput): AnalyzeProductResult {
  const baseScore = Math.max(0, Math.min(100, Math.round(input.supplierRating * 20)));
  const costPenalty = input.costCents > 15_000 ? 12 : input.costCents > 8_000 ? 6 : 0;
  const keywordBoost = /trend|viral|premium|bundle/i.test(`${input.title} ${input.description}`) ? 8 : 0;
  const score = Math.max(0, Math.min(100, baseScore - costPenalty + keywordBoost));

  const riskLevel: AnalyzeProductResult['riskLevel'] = score >= 75 ? 'low' : score >= 50 ? 'medium' : 'high';

  return {
    score,
    riskLevel,
    summary:
      riskLevel === 'low'
        ? 'Strong listing potential with healthy supplier profile.'
        : riskLevel === 'medium'
        ? 'Good candidate, but pricing and fulfillment need monitoring.'
        : 'Higher risk product; validate supplier and demand before scaling.',
  };
}

export function recommendPricing(product: Pick<Product, 'costCents'>, rules: PricingRules): PricingRecommendation {
  const targetMargin = Math.min(Math.max(rules.minMarginPercent, 30), rules.maxMarginPercent);
  const rawPrice = product.costCents / (1 - targetMargin / 100);
  const rounded = Math.ceil(rawPrice / rules.roundToNearest) * rules.roundToNearest;
  const marginPercent = Math.round(((rounded - product.costCents) / rounded) * 100);

  return {
    recommendedPriceCents: rounded,
    marginPercent,
  };
}

export function assessRisk(product: Pick<Product, 'costCents' | 'inventory' | 'riskLevel'>): RiskAssessment {
  const reasons: string[] = [];

  if (product.costCents > 20_000) {
    reasons.push('High unit cost increases downside exposure.');
  }

  if (product.inventory < 5) {
    reasons.push('Low inventory may increase stockout probability.');
  }

  if (product.riskLevel === 'high') {
    reasons.push('AI product analysis marked this listing as high risk.');
  }

  const riskLevel: RiskAssessment['riskLevel'] =
    reasons.length === 0 ? 'low' : reasons.length === 1 ? 'medium' : 'high';

  return {
    riskLevel,
    reasons,
  };
}
