/**
 * POST /api/orchestrate
 * Unified AI orchestration endpoint
 * Routes requests to appropriate providers, manages credits, logs execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deductCredits, hasSufficientBalance } from '@/lib/orchestrator/ledger';
import { toolRegistry, type ToolId } from '@/lib/tools/registry';
import { reportError } from '@/lib/observability/report-error';
import { getAgent } from '@/lib/agents/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface OrchestrationRequest {
  agentId: string;
  taskType: 'text-generation' | 'tool-execution';
  input: Record<string, unknown>;
  toolId?: ToolId;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const supabase = createSupabaseServerClient();

  try {
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request
    const body: OrchestrationRequest = await request.json();
    const { agentId, taskType, input, toolId } = body;

    if (!agentId || !taskType || !input) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, taskType, input' },
        { status: 400 }
      );
    }

    // 3. Validate agent
    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: `Unknown agent: ${agentId}` },
        { status: 400 }
      );
    }

    // Text generation ran only on OpenRouter / OpenAI / DeepSeek (lib/providers/text-factory). It was refused while
    // AI_GOOGLE_ONLY was on, and the kill switch that re-opened it is gone (MASTER TASK v3.1, audit F-04): refused
    // before any balance read or charge.
    if (taskType === 'text-generation') {
      return NextResponse.json({ error: 'google_only', message: 'Text runs on Google models only.' }, { status: 503 });
    }

    // 4. Estimate credits (basic estimation)
    const creditsRequired = estimateCredits(taskType, input);

    // 5. Check credits against the CANONICAL balance-of-record (profiles.credits_balance), harmonized
    //    off the legacy public.credits table (Iteration 3 ledger unification). Fail-open on a read miss
    //    (the ref-idempotent deduct below is the real backstop and rejects an actual overdraw).
    const sufficient = await hasSufficientBalance(user.id, creditsRequired).catch(() => true);
    if (!sufficient) {
      return NextResponse.json(
        { error: 'Insufficient credits', required: creditsRequired },
        { status: 402 } // Payment Required
      );
    }

    // 6. Run the tool (the only task type left).
    if (taskType !== 'tool-execution') {
      return NextResponse.json(
        { error: `Unsupported task type: ${taskType}` },
        { status: 400 }
      );
    }
    if (!toolId) {
      return NextResponse.json(
        { error: 'toolId required for tool-execution' },
        { status: 400 }
      );
    }
    const providerId = 'internal-tool';
    const result: Record<string, unknown> = await toolRegistry.executeTool(toolId, input);
    const tokensIn = 0;
    const tokensOut = 0;
    const costUsd = 0;

    const executionTime = Date.now() - startTime;

    // 7. Deduct from the CANONICAL ledger with a per-transaction idempotency ref (Iteration 3 — was the
    //    legacy public.credits overload). The canonical deduct_credits(uuid,int,text) returns the new
    //    balance (integer) and RAISES on an insufficient balance (surfaced here as `deductError`).
    //    ⚠️ Through the SERVICE-ROLE ledger helper, never the session client: deduct_credits trusts the
    //    p_user_id it is handed, so as of 20260929a only service_role may execute it.
    const deductRef = `orchestrate:${agentId}:${crypto.randomUUID()}`;
    const debit = await deductCredits(user.id, creditsRequired, deductRef);

    if (!debit.ok) {
      console.error('Credit deduction failed:', debit.reason);
      return NextResponse.json(
        { error: 'Credit deduction failed', reason: debit.reason },
        { status: 402 }
      );
    }
    const newBalance = debit.balance;

    // 8. Log orchestration run
    await supabase.from('orchestration_runs').insert({
      user_id: user.id,
      agent_id: agentId,
      provider_id: providerId,
      task_type: taskType,
      input_hash: hashInput(input),
      input_summary: String(input.prompt || '').substring(0, 200),
      output_summary: String(result.text || JSON.stringify(result)).substring(0, 200),
      status: 'completed',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      credits_spent: creditsRequired,
      duration_ms: executionTime,
      completed_at: new Date().toISOString(),
    });

    // 9. Return success response
    return NextResponse.json({
      success: true,
      result,
      usage: {
        credits_spent: creditsRequired,
        credits_remaining: newBalance,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        duration_ms: executionTime,
      },
      provider: providerId,
    });

  } catch (error) {
    reportError(error, { route: '/api/orchestrate', durationMs: Date.now() - startTime });

    // Log failed run
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('orchestration_runs').insert({
          user_id: user.id,
          agent_id: 'unknown',
          provider_id: 'unknown',
          task_type: 'unknown',
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - startTime,
        });
      }
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { 
        error: 'Orchestration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Estimate credits required for task
 */
function estimateCredits(taskType: string, input: Record<string, unknown>): number {
  if (taskType === 'text-generation') {
    const promptLength = String(input.prompt || '').length;
    const maxTokens = Number(input.max_tokens || 1000);
    
    // Rough estimation: 1 credit per ~100 tokens
    const estimatedTokens = Math.floor(promptLength / 4) + maxTokens;
    return Math.max(Math.ceil(estimatedTokens / 100), 1);
  }

  if (taskType === 'tool-execution') {
    return 1; // Tools cost 1 credit
  }

  return 5; // Default fallback
}

/**
 * Hash input for logging (privacy)
 */
function hashInput(input: Record<string, unknown>): string {
  const str = JSON.stringify(input);
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}
