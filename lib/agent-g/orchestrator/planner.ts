import crypto from 'node:crypto';
import type { AgentGTaskPlan, AgentGTaskType } from '@/lib/agent-g/types';

function detectType(goal: string): AgentGTaskType {
  const g = goal.toLowerCase();
  const hasBusiness = /(business|plan|strategy|revenue|market\s?research)/.test(g);
  const hasSocial = /(social|post|campaign|instagram|tiktok|facebook|linkedin|content)/.test(g);
  const hasVoice = /(voice|narration|audio|voiceover|tts)/.test(g);
  const hasAvatar = /(avatar|character|persona)/.test(g);
  const hasMarketplace = /(marketplace|listing|launch|product)/.test(g);

  const count = [hasBusiness, hasSocial, hasVoice, hasAvatar, hasMarketplace].filter(Boolean).length;
  if (count > 1) return 'hybrid';
  if (hasBusiness) return 'business';
  if (hasSocial) return 'social';
  if (hasVoice) return 'voice';
  if (hasAvatar) return 'avatar';
  if (hasMarketplace) return 'marketplace';
  return 'hybrid';
}

export function buildTaskPlan(goal: string): AgentGTaskPlan {
  const taskType = detectType(goal);
  const subTasks: AgentGTaskPlan['sub_tasks'] = [];

  const add = (agent: AgentGTaskPlan['sub_tasks'][number]['agent'], action: string, input: Record<string, unknown>) => {
    subTasks.push({ agent, action, input });
  };

  if (taskType === 'business' || taskType === 'hybrid') {
    add('business-agent', 'create_plan', { goal, depth: 'full' });
  }
  if (taskType === 'social' || taskType === 'hybrid') {
    add('social-media', 'generate_posts', { goal, count: 10 });
  }
  if (taskType === 'voice' || taskType === 'hybrid') {
    add('voice-lab', 'generate_voice', { goal, language: 'en' });
  }
  if (taskType === 'marketplace' || taskType === 'hybrid') {
    add('marketplace', 'prepare_listing', { goal, includePricing: true });
  }
  if (taskType === 'avatar' || taskType === 'hybrid') {
    add('avatar-builder', 'generate_avatar_brief', { goal });
  }

  if (subTasks.length === 0) {
    add('business-agent', 'create_plan', { goal, depth: 'lite' });
  }

  return {
    main_goal: goal,
    task_type: taskType,
    sub_tasks: subTasks,
    expected_outputs: [
      'unified_summary',
      'markdown_report',
      'pdf_report',
      'zip_bundle',
      'optional_audio',
      'optional_video',
    ],
  };
}

export function makeTaskId(prefix = 'agt'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
