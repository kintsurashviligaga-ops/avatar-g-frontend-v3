import type { AgentGTaskPlan } from '@/lib/agent-g/types';

export type DelegationTarget = {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
};

export function mapSubTaskToDelegateTarget(subTask: AgentGTaskPlan['sub_tasks'][number]): DelegationTarget {
  if (subTask.agent === 'business-agent') {
    return {
      endpoint: '/api/business-agent/projects',
      method: 'GET',
    };
  }

  if (subTask.agent === 'social-media') {
    return {
      endpoint: '/api/chat',
      method: 'POST',
      body: {
        message: `Create social media post ideas for: ${String(subTask.input.goal || '')}`,
        context: 'global',
      },
    };
  }

  if (subTask.agent === 'voice-lab') {
    return {
      endpoint: '/api/voice-lab/jobs',
      method: 'POST',
      body: {
        type: 'generate',
        input: {
          text: String(subTask.input.goal || ''),
          language: String(subTask.input.language || 'en'),
          title: 'Agent G Narration',
        },
      },
    };
  }

  if (subTask.agent === 'marketplace') {
    return {
      endpoint: '/api/marketplace/listings?limit=3',
      method: 'GET',
    };
  }

  return {
    endpoint: '/api/avatars?limit=1',
    method: 'GET',
  };
}
