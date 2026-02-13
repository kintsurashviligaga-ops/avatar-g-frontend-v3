/**
 * Seller KPI API
 * 
 * Endpoint: GET /api/seller/kpi
 * 
 * Returns real-time KPI metrics for the authenticated seller:
 * - Today's sales
 * - Net profit
 * - VAT payable
 * - Current margin
 * - Break-even estimate
 * - Risk score
 * - Recommended prices
 * - Total orders
 * - Pending payouts
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // TODO: Get authenticated user ID from session
    // For now, use mock data
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // TODO: Fetch real data from Supabase
    // const supabase = createClient(
    //   process.env.NEXT_PUBLIC_SUPABASE_URL!,
    //   process.env.SUPABASE_SERVICE_ROLE_KEY!
    // );

    // const { data: sellerProfile } = await supabase
    //   .from("seller_profiles")
    //   .select("*")
    //   .eq("user_id", userId)
    //   .single();

    // const { data: todayOrders } = await supabase
    //   .from("orders")
    //   .select("*")
    //   .eq("seller_id", userId)
    //   .gte("created_at", new Date().toISOString().split("T")[0])
    //   .eq("status", "completed");

    // Calculate today's sales
    // const todaySalesCents = todayOrders?.reduce((sum, order) => sum + order.total_cents, 0) || 0;

    // Calculate net profit (with margin calculation)
    // Use /lib/finance/margin.ts computeMargin() function

    // Calculate VAT payable (18% if VAT payer)
    // const vatPayableCents = sellerProfile?.tax_status === "vat_payer"
    //   ? Math.round((todaySalesCents * 1800) / 10000)
    //   : 0;

    // Mock KPI data (replace with real calculations)
    const kpi = {
      todaySalesCents: 125000, // 1250 GEL
      netProfitCents: 31250, // 312.50 GEL (25% margin)
      vatPayableCents: 22500, // 225 GEL
      currentMarginBps: 2500, // 25%
      breakEvenDaysEstimate: 14,
      riskScore: 25, // Low risk
      recommendedMinPriceCents: 8500, // 85 GEL
      totalOrders: 18,
      pendingPayoutCents: 58000, // 580 GEL
    };

    return NextResponse.json({ success: true, kpi });

  } catch (error) {
    console.error("[Seller KPI Error]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
