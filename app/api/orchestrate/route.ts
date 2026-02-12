/**
 * POST /api/orchestrate
 * Unified AI orchestration endpoint
 * Routes requests to appropriate providers, manages credits, logs execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { textProviderFactory, type TextProviderId } from '@/lib/providers/text-factory';
import { toolRegistry, type ToolId } from '@/lib/tools/registry';
import { getAgent } from '@/lib/agents/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface OrchestrationRequest {
  agentId: string;
  taskType: 'text-generation' | 'tool-execution';
  input: Record<string, unknown>;
  providerPreference?: TextProviderId;
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
    const { agentId, taskType, input, providerPreference, toolId } = body;

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

    // 4. Estimate credits (basic estimation)
    const creditsRequired = estimateCredits(taskType, input);

    // 5. Check user credits
    const { data: userCredits } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!userCredits || userCredits.balance < creditsRequired) {
      return NextResponse.json(
        { 
          error: 'Insufficient credits',
          required: creditsRequired,
          available: userCredits?.balance || 0
        },
        { status: 402 } // Payment Required
      );
    }

    // 6. Process based on task type
    let result: Record<string, unknown>;
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    let providerId = 'none';

    if (taskType === 'text-generation') {
      // Text generation via LLM provider
      const provider = textProviderFactory.selectProvider(providerPreference);
      providerId = provider.name;

      const textResult = await provider.generateText({
        prompt: String(input.prompt || ''),
        system_prompt: String(input.system_prompt || ''),
        max_tokens: Number(input.max_tokens || 1000),
        temperature: Number(input.temperature ?? 0.7),
        model: String(input.model || ''),
      });

      tokensIn = textResult.tokens_in;
      tokensOut = textResult.tokens_out;
      costUsd = textResult.cost_usd;

      result = {
        text: textResult.text,
        model: textResult.model,
        generation_time_ms: textResult.generation_time_ms,
      };

    } else if (taskType === 'tool-execution') {
      // Tool execution
      if (!toolId) {
        return NextResponse.json(
          { error: 'toolId required for tool-execution' },
          { status: 400 }
        );
      }

      providerId = 'internal-tool';
      result = await toolRegistry.executeTool(toolId, input);

    } else {
      return NextResponse.json(
        { error: `Unsupported task type: ${taskType}` },
        { status: 400 }
      );
    }

    const executionTime = Date.now() - startTime;

    // 7. Deduct credits atomically
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', {
        p_user_id: user.id,
        p_amount: creditsRequired,
        p_job_id: null,
        p_agent_id: agentId,
        p_description: `${taskType} via ${providerId}`,
      });

    if (deductError || !deductResult?.[0]?.success) {
      console.error('Credit deduction failed:', deductError);
      return NextResponse.json(
        { error: 'Credit deduction failed', details: deductResult?.[0]?.error_message },
        { status: 500 }
      );
    }

    const newBalance = deductResult[0].new_balance;

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
    console.error('Orchestration error:', error);

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
