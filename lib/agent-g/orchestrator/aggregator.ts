import type { AgentGAggregatedResult, AgentGSubtask } from '@/lib/agent-g/types';

export function aggregateResults(goal: string, subTasks: AgentGSubtask[]): AgentGAggregatedResult {
  const completed = subTasks.filter((item) => item.status === 'completed').length;
  const failed = subTasks.filter((item) => item.status === 'failed').length;

  const summary = [
    `Main goal: ${goal}`,
    `Completed subtasks: ${completed}/${subTasks.length}`,
    failed > 0 ? `Failed subtasks: ${failed}` : 'No failed subtasks',
  ].join('\n');

  const details = subTasks
    .map((item, idx) => {
      const output = item.output ? JSON.stringify(item.output, null, 2) : 'No output';
      const error = item.error ? `\nError: ${item.error}` : '';
      return `## ${idx + 1}. ${item.agent} / ${item.action}\nStatus: ${item.status}${error}\n\n\n\`\`\`json\n${output}\n\`\`\``;
    })
    .join('\n\n');

  const markdown = `# Agent G Orchestration Result\n\n${summary}\n\n${details}`;

  return {
    summary,
    markdown,
    subtasks: subTasks,
    outputs: {
      text: true,
      pdf: true,
      zip: true,
      audio: subTasks.some((item) => item.agent === 'voice-lab' && item.status === 'completed'),
      video: false,
    },
  };
}
