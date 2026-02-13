/**
 * Revenue Forecast System
 * 
 * Generates 1, 3, and 6-month revenue projections based on:
 * - Current GMV (Gross Merchandise Value)
 * - Historical growth rate
 * - Seasonal patterns
 * - Margin trends
 * - LTV/CAC ratio
 * - Market saturation
 * 
 * All calculations use integer cents.
 */

export interface ForecastInput {
  currentMonthlyGMVCents: number;
  historicalGrowthRateBps: number; // Monthly growth in basis points (e.g., 1500 = 15%)
  avgMarginBps: number;
  platformFeeBps: number;
  ltvCents: number;
  cacCents: number;
  monthsOfHistory: number; // How many months of data we have
}

export interface MonthlyForecast {
  month: number; // 1, 3, or 6
  gmvProjectionCents: number;
  revenueProjectionCents: number; // Platform revenue (fees)
  netProfitProjectionCents: number; // Seller net profit
  estimatedOrders: number;
  ltvCacRatio: number;
  confidenceScore: number; // 0.0 to 1.0
}

export interface ForecastResult {
  forecasts: MonthlyForecast[];
  assumptions: string[]; // Georgian explanations
  risks: string[]; // Risk factors
  recommendations: string[]; // Georgian recommendations
}

/**
 * Generate revenue forecast for 1, 3, and 6 months
 */
export function forecastRevenue(input: ForecastInput): ForecastResult {
  const forecasts: MonthlyForecast[] = [];
  
  // Generate forecasts for months 1, 3, 6
  for (const targetMonth of [1, 3, 6]) {
    const forecast = projectMonth(input, targetMonth);
    forecasts.push(forecast);
  }

  // Generate assumptions
  const assumptions = generateAssumptions(input);

  // Identify risks
  const risks = identifyRisks(input, forecasts);

  // Generate recommendations
  const recommendations = generateRecommendations(input, forecasts);

  return {
    forecasts,
    assumptions,
    risks,
    recommendations,
  };
}

/**
 * Project revenue for a specific month ahead
 */
function projectMonth(input: ForecastInput, monthsAhead: number): MonthlyForecast {
  const {
    currentMonthlyGMVCents,
    historicalGrowthRateBps,
    avgMarginBps,
    platformFeeBps,
    ltvCents,
    cacCents,
  } = input;

  // Calculate growth with diminishing returns
  // Formula: GMV(n) = GMV(0) * (1 + growth)^n * saturationFactor
  const growthRate = historicalGrowthRateBps / 10000;
  const saturationFactor = calculateSaturationFactor(monthsAhead);
  const adjustedGrowthRate = growthRate * saturationFactor;

  // Compound growth
  const growthMultiplier = Math.pow(1 + adjustedGrowthRate, monthsAhead);
  const gmvProjectionCents = Math.round(currentMonthlyGMVCents * growthMultiplier);

  // Platform revenue (fees)
  const revenueProjectionCents = Math.round((gmvProjectionCents * platformFeeBps) / 10000);

  // Seller net profit
  const netProfitProjectionCents = Math.round((gmvProjectionCents * avgMarginBps) / 10000);

  // Estimate number of orders (assume avg order value = currentGMV / 30 orders)
  const avgOrderValueCents = Math.round(currentMonthlyGMVCents / 30);
  const estimatedOrders = Math.round(gmvProjectionCents / (avgOrderValueCents || 1));

  // LTV/CAC ratio
  const ltvCacRatio = cacCents > 0 ? Math.round((ltvCents / cacCents) * 100) / 100 : 0;

  // Confidence score (decreases with longer projections)
  const confidenceScore = calculateConfidenceScore(
    input.monthsOfHistory,
    monthsAhead,
    historicalGrowthRateBps
  );

  return {
    month: monthsAhead,
    gmvProjectionCents,
    revenueProjectionCents,
    netProfitProjectionCents,
    estimatedOrders,
    ltvCacRatio,
    confidenceScore,
  };
}

/**
 * Calculate market saturation factor
 * Early months: Full growth potential
 * Later months: Diminishing returns due to market saturation
 */
function calculateSaturationFactor(monthsAhead: number): number {
  // Saturation curve: starts at 1.0, gradually decreases
  // Month 1: 1.0, Month 3: 0.85, Month 6: 0.70
  if (monthsAhead <= 1) return 1.0;
  if (monthsAhead <= 3) return 0.90 - (monthsAhead - 1) * 0.05;
  return 0.80 - (monthsAhead - 3) * 0.03;
}

/**
 * Calculate confidence score based on available data
 */
function calculateConfidenceScore(
  monthsOfHistory: number,
  monthsAhead: number,
  growthRateBps: number
): number {
  let score = 1.0;

  // Penalize if limited historical data
  if (monthsOfHistory < 3) {
    score *= 0.6; // Low confidence with < 3 months data
  } else if (monthsOfHistory < 6) {
    score *= 0.8; // Medium confidence with < 6 months data
  }

  // Penalize long-term forecasts
  if (monthsAhead >= 6) {
    score *= 0.7; // 6-month forecasts less reliable
  } else if (monthsAhead >= 3) {
    score *= 0.85; // 3-month forecasts moderately reliable
  }

  // Penalize volatile growth rates
  const growthPercent = Math.abs(growthRateBps / 100);
  if (growthPercent > 50) {
    score *= 0.75; // Very high growth is hard to sustain
  } else if (growthPercent < 5) {
    score *= 0.90; // Very low growth is more predictable
  }

  return Math.round(score * 100) / 100; // 2 decimal places
}

/**
 * Generate forecast assumptions (Georgian)
 */
function generateAssumptions(input: ForecastInput): string[] {
  const growthPercent = (input.historicalGrowthRateBps / 100).toFixed(1);
  const marginPercent = (input.avgMarginBps / 100).toFixed(1);

  return [
    `თვიური ზრდის ტემპი: ${growthPercent}% (ისტორიული მონაცემებიდან)`,
    `საშუალო მარჟა: ${marginPercent}%`,
    `LTV/CAC თანაფარდობა: ${(input.ltvCents / input.cacCents).toFixed(2)}`,
    `ბაზრის გაჯერება: თანდათანობითი შემცირება 6 თვეში`,
    `სეზონურობა: არ არის გათვალისწინებული (საჭიროებს დამატებით მონაცემებს)`,
  ];
}

/**
 * Identify forecast risks (Georgian)
 */
function identifyRisks(input: ForecastInput, forecasts: MonthlyForecast[]): string[] {
  const risks: string[] = [];

  // Low confidence score
  const avgConfidence = forecasts.reduce((sum, f) => sum + f.confidenceScore, 0) / forecasts.length;
  if (avgConfidence < 0.7) {
    risks.push(`⚠️ დაბალი სანდოობის დონე (${(avgConfidence * 100).toFixed(0)}%) - შეზღუდული ისტორიული მონაცემები`);
  }

  // Poor LTV/CAC ratio
  const ltvCacRatio = input.ltvCents / input.cacCents;
  if (ltvCacRatio < 1.5) {
    risks.push(`⚠️ დაბალი LTV/CAC თანაფარდობა (${ltvCacRatio.toFixed(2)}) - მარკეტინგი არაეფექტურია`);
  }

  // Low margin
  if (input.avgMarginBps < 2000) {
    const marginPercent = (input.avgMarginBps / 100).toFixed(1);
    risks.push(`⚠️ დაბალი მარჟა (${marginPercent}%) - ნაკლებია 20%-ზე`);
  }

  // High growth rate (unsustainable)
  if (input.historicalGrowthRateBps > 5000) {
    risks.push(`⚠️ ძალიან მაღალი ზრდის ტემპი - შესაძლოა არასტაბილური`);
  }

  // Limited history
  if (input.monthsOfHistory < 3) {
    risks.push(`⚠️ მცირე ისტორიული მონაცემები (${input.monthsOfHistory} თვე) - პროგნოზი ნაკლებად ზუსტია`);
  }

  return risks;
}

/**
 * Generate recommendations (Georgian)
 */
function generateRecommendations(input: ForecastInput, forecasts: MonthlyForecast[]): string[] {
  const recommendations: string[] = [];

  // LTV/CAC optimization
  const ltvCacRatio = input.ltvCents / input.cacCents;
  if (ltvCacRatio < 2.0) {
    recommendations.push(`📈 გაზარდე LTV/CAC თანაფარდობა: გააუმჯობესე მარკეტინგი ან გაზარდე საშუალო შეკვეთის ღირებულება`);
  }

  // Margin improvement
  if (input.avgMarginBps < 2500) {
    recommendations.push(`💰 გაზარდე მარჟა: შეამცირე ხარჯები ან გაზარდე ფასები`);
  }

  // Scale up if good metrics
  if (ltvCacRatio > 2.5 && input.avgMarginBps > 2500) {
    recommendations.push(`🚀 შენი მეტრიკები კარგია - გაზარდე მარკეტინგის ბიუჯეტი სწრაფი ზრდისთვის`);
  }

  // Product diversification
  const sixMonthGMV = forecasts.find((f) => f.month === 6)?.gmvProjectionCents || 0;
  if (sixMonthGMV > 100000000) { // > 1M GEL
    recommendations.push(`📦 დაამატე ახალი პროდუქტები ან კატეგორიები ბაზრის გაჯერების თავიდან ასაცილებლად`);
  }

  // Retention focus
  if (ltvCacRatio < 3.0) {
    recommendations.push(`🔁 გაზარდე შენახვის მაჩვენებელი: გააუმჯობესე პროდუქტის ხარისხი და მომხმარებელთა სერვისი`);
  }

  return recommendations;
}

/**
 * Calculate break-even timeline
 */
export function calculateBreakEvenTimeline(
  initialInvestmentCents: number,
  monthlyNetProfitCents: number,
  growthRateBps: number
): { monthsToBreakEven: number; breakEvenDateEstimate: Date } {
  let cumulativeProfitCents = 0;
  let monthsPassed = 0;
  const growthRate = growthRateBps / 10000;

  while (cumulativeProfitCents < initialInvestmentCents && monthsPassed < 36) {
    // Account for growth
    const monthProfit = Math.round(monthlyNetProfitCents * Math.pow(1 + growthRate, monthsPassed));
    cumulativeProfitCents += monthProfit;
    monthsPassed++;
  }

  const breakEvenDate = new Date();
  breakEvenDate.setMonth(breakEvenDate.getMonth() + monthsPassed);

  return {
    monthsToBreakEven: monthsPassed,
    breakEvenDateEstimate: breakEvenDate,
  };
}
