type TaskShape = {
  id: string;
  goal: string;
  results?: {
    summary?: string;
    subtasks?: Array<{ agent?: string; action?: string; status?: string }>;
  } | null;
};

export function buildCallbackScript(task: TaskShape, dashboardUrl: string): string {
  const steps = (task.results?.subtasks || [])
    .map((item) => `${item.agent || 'agent'}: ${item.action || 'action'} (${item.status || 'unknown'})`)
    .slice(0, 5)
    .join('; ');

  const summary = task.results?.summary || 'Your request has been processed.';

  return [
    `Hello, Agent G callback for your request: ${task.goal}.`,
    `Completed work summary: ${summary}`,
    steps ? `Sub-agent actions: ${steps}.` : 'Sub-agent actions were executed.',
    `Your downloadable outputs are ready in Agent G dashboard: ${dashboardUrl}.`,
    'Suggested next step: review outputs, then run refinement if needed.',
  ].join(' ');
}
