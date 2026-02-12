/**
 * POST /api/agents/execute
 * Execute an agent with plan/credit enforcement
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { withEnforcement } from '@/lib/billing/enforce';
import { deductCredits } from '@/lib/billing/enforce';
import { createJob } from '@/lib/jobs/jobs';
import { getAgent } from '@/lib/agents/registry';
import { getCreditCost } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request
    const body = await request.json();
    const { agentId, action, input } = body;
    
    if (!agentId || !action || !input) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, action, input' },
        { status: 400 }
      );
    }
    
    // Get agent config
    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentId}` },
        { status: 404 }
      );
    }
    
    if (!agent.enabled) {
      return NextResponse.json(
        { error: `Agent ${agentId} is not available yet` },
        { status: 403 }
      );
    }
    
    // Get credit cost for this action
    const actionKey = `${agentId}.${action}` as keyof ReturnType<typeof getCreditCost>;
    const cost = (getCreditCost(actionKey as any) as number | undefined) || agent.baseCost;
    
    // Enforce plan + credits
    const result = await withEnforcement(
      user.id,
      {
        agentId,
        cost,
        requiredPlan: agent.requiredPlan,
      },
      async (context) => {
        // Create job
        const job = await createJob({
          userId: user.id,
          agentId,
          type: action,
          inputJson: input,
          costCredits: cost,
          planRequired: agent.requiredPlan,
        });
        
        // Deduct credits
        const deduction = await deductCredits({
          userId: user.id,
          amount: cost,
          jobId: job.id,
          agentId,
          description: `${agent.name} - ${action}`,
        });
        
        return {
          jobId: job.id,
          status: job.status,
          cost,
          balance: deduction.newBalance,
        };
      }
    );
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Agent execution error:', error);
    
    // Handle enforcement errors
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const enforcementError = error as { statusCode: number; toJSON: () => unknown };
      return NextResponse.json(
        enforcementError.toJSON(),
        { status: enforcementError.statusCode }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to execute agent',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
