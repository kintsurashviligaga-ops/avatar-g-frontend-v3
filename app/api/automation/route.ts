import { NextRequest, NextResponse } from 'next/server';
import { buildPlan, validatePlan } from '@/lib/automation/planner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/automation — Build an automation plan
 * Body: { userId, serviceId, userInput, title? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId?: string;
      serviceId?: string;
      userInput?: string;
      title?: string;
    };

    if (!body.userId || !body.serviceId || !body.userInput) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, serviceId, userInput' },
        { status: 400 }
      );
    }

    const plan = buildPlan({
      serviceId: body.serviceId,
      userId: body.userId,
      userInput: body.userInput,
      title: body.title,
    });

    const validation = validatePlan(plan);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid plan', details: validation.errors, plan },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
