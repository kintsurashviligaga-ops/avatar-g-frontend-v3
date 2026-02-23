/** @jest-environment node */

import { routeAI, selectRoutingPolicyForPlan } from '@/lib/ai/router';

const registry = [
  {
    service_id: 'text-intelligence',
    capabilities: ['text_generation'],
    providers: [
      {
        provider: 'deepseek',
        model: 'chat',
        estimated_cost_units: 10,
        expected_latency_ms: 900,
        reliability_score: 0.85,
      },
      {
        provider: 'openai',
        model: 'gpt-4.1',
        estimated_cost_units: 60,
        expected_latency_ms: 1300,
        reliability_score: 0.98,
      },
    ],
  },
];

describe('AI Router', () => {
  test('selects low-cost provider on FREE plan', async () => {
    const result = await routeAI({
      message: 'Generate an ad copy',
      user_id: '00000000-0000-0000-0000-000000000001',
      org_id: null,
      plan: 'FREE',
      context: {},
      service_registry: registry,
    });

    expect(result.selected_provider).toBe('deepseek');
    expect(result.fallback_chain.length).toBeGreaterThan(0);
  });

  test('selects high-quality provider on AGENT_G_FULL plan', async () => {
    const result = await routeAI({
      message: 'Generate an enterprise strategy memo',
      user_id: '00000000-0000-0000-0000-000000000002',
      org_id: null,
      plan: 'AGENT_G_FULL',
      context: {},
      service_registry: registry,
    });

    expect(['openai', 'deepseek']).toContain(result.selected_provider);
    expect(selectRoutingPolicyForPlan('AGENT_G_FULL')).toContain('full_priority');
  });
});
