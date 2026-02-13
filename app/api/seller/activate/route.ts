/**
 * Seller Activation API
 * 
 * Endpoint: POST /api/seller/activate
 * 
 * Activates a new seller by:
 * 1. Running onboarding automation
 * 2. Storing seller profile in database
 * 3. Logging onboarding events
 * 4. Returning activation result
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSellerOnboarding } from "@/lib/onboarding/automationEngine";
import type { TaxStatus, BusinessType } from "@/lib/onboarding/types";

// Request validation schema
const activationSchema = z.object({
  userId: z.string().uuid(),
  taxStatus: z.enum(["vat_payer", "non_vat_payer"]),
  businessType: z.enum(["dropshipping", "own_product", "digital"]),
  targetMonthlyIncomeCents: z.number().int().min(10000), // Min 100 GEL
  availableBudgetCents: z.number().int().min(5000), // Min 50 GEL
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validatedData = activationSchema.parse(body);

    // Extract validated data
    const {
      userId,
      taxStatus,
      businessType,
      targetMonthlyIncomeCents,
      availableBudgetCents,
    } = validatedData;

    // Run onboarding automation
    const result = await runSellerOnboarding(
      userId,
      taxStatus as TaxStatus,
      businessType as BusinessType,
      targetMonthlyIncomeCents,
      availableBudgetCents
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Onboarding automation failed",
          details: result.errors,
        },
        { status: 500 }
      );
    }

    // TODO: Store seller profile in Supabase
    // await supabase.from("seller_profiles").insert({
    //   user_id: profile.userId,
    //   tax_status: profile.taxStatus,
    //   business_type: profile.businessType,
    //   target_monthly_income_cents: profile.targetMonthlyIncomeCents,
    //   available_budget_cents: profile.availableBudgetCents,
    //   pricing_mode: profile.pricingMode,
    //   margin_floor_bps: profile.marginFloorBps,
    //   margin_target_bps: profile.marginTargetBps,
    //   guardrails_enabled: profile.guardrailsEnabled,
    //   onboarding_completed_at: new Date(),
    // });

    // TODO: Store onboarding events in database
    // for (const event of result.events) {
    //   await supabase.from("onboarding_events").insert({
    //     user_id: event.userId,
    //     event_type: event.eventType,
    //     status: event.status,
    //     metadata_json: event.metadataJson,
    //     created_at: event.createdAt,
    //   });
    // }

    // Return success result
    return NextResponse.json({
      success: true,
      profile: result.profile,
      pricingRecommendation: result.pricingRecommendation,
      gtmPlan: result.gtmPlan,
      events: result.events,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    console.error("[Seller Activation Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
