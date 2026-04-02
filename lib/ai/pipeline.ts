import { toolsRegistry, ToolName, executeTool } from './tools';

export interface PipelineNode {
  id: string;
  tool: ToolName;
  input: Record<string, unknown>;
  dependsOn?: string[];
}

export interface PipelineExecution {
  id: string;
  nodes: PipelineNode[];
  status: 'pending' | 'running' | 'completed' | 'error';
  results: Record<string, { success: boolean; result: any; error?: string }>;
  startedAt: number;
  completedAt?: number;
}

class PipelineEngine {
  async executePipeline(nodes: PipelineNode[]): Promise<PipelineExecution> {
    const executionId = `exec-${Date.now()}`;
    const execution: PipelineExecution = {
      id: executionId,
      nodes,
      status: 'running',
      results: {},
      startedAt: Date.now(),
    };

    for (const node of nodes) {
      try {
        const result = await executeTool(node.tool, node.input);
        execution.results[node.id] = result;
        
        if (!result.success) {
          execution.status = 'error';
          break;
        }
      } catch (error) {
        execution.results[node.id] = {
          success: false,
          result: null,
          error: (error as Error).message,
        };
        execution.status = 'error';
        break;
      }
    }

    execution.status = execution.status === 'error' ? 'error' : 'completed';
    execution.completedAt = Date.now();
    return execution;
  }

  // For workflows: resolve dependencies and execute in order
  async executeWorkflow(nodes: PipelineNode[]): Promise<PipelineExecution> {
    const sorted = this.topologicalSort(nodes);
    return this.executePipeline(sorted);
  }

  private topologicalSort(nodes: PipelineNode[]): PipelineNode[] {
    const visited = new Set<string>();
    const result: PipelineNode[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      (node.dependsOn || []).forEach((dep) => visit(dep));
      result.push(node);
    };

    nodes.forEach((n) => visit(n.id));
    return result;
  }
}

export const pipelineEngine = new PipelineEngine();
