import type { AgentGSubtask, AgentGTaskPlan, AgentGTaskStatus } from '@/lib/agent-g/types';

type ExecutorOptions = {
  origin: string;
  authHeader?: string;
  internalSecret?: string;
  demoMode?: boolean;
};

async function callDelegate(
  subTask: AgentGTaskPlan['sub_tasks'][number],
  options: ExecutorOptions
): Promise<AgentGSubtask> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (options.authHeader) {
    headers.authorization = options.authHeader;
  }

  if (options.internalSecret) {
    headers['x-agent-g-secret'] = options.internalSecret;
  }

  const payload = {
    agent_name: subTask.agent,
    action: subTask.action,
    input: subTask.input,
    demo_mode: Boolean(options.demoMode),
  };

  try {
    const response = await fetch(`${options.origin}/api/agent-g/delegate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const json = (await response.json().catch(() => null)) as
      | { status?: string; data?: { output?: Record<string, unknown> }; error?: string }
      | null;

    if (!response.ok || !json || json.status === 'error') {
      return {
        id: `${subTask.agent}_${Date.now()}`,
        agent: subTask.agent,
        action: subTask.action,
        status: 'failed',
        input: subTask.input,
        error: json?.error || `Delegate call failed (${response.status})`,
      };
    }

    return {
      id: `${subTask.agent}_${Date.now()}`,
      agent: subTask.agent,
      action: subTask.action,
      status: 'completed',
      input: subTask.input,
      output: json.data?.output || {},
    };
  } catch (error) {
    return {
      id: `${subTask.agent}_${Date.now()}`,
      agent: subTask.agent,
      action: subTask.action,
      status: 'failed',
      input: subTask.input,
      error: error instanceof Error ? error.message : 'Delegate call failed',
    };
  }
}

export async function executePlan(plan: AgentGTaskPlan, options: ExecutorOptions) {
  const subtasks: AgentGSubtask[] = [];

  for (const subTask of plan.sub_tasks) {
    const result = await callDelegate(subTask, options);
    subtasks.push(result);
  }

  const failed = subtasks.some((item) => item.status === 'failed');
  const completed = subtasks.some((item) => item.status === 'completed');

  let status: AgentGTaskStatus = 'failed';
  if (completed && failed) status = 'partial';
  if (completed && !failed) status = 'completed';

  return { status, subtasks };
}
