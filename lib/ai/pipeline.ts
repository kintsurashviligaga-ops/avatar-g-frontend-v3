import { createHash } from 'node:crypto';
import { executeTool, ToolName } from './tools';
import { cacheGet, cacheSet } from '@/lib/platform/cache';

// ─── Node & execution types ───────────────────────────────────────────────────

export interface PipelineNode {
  id: string;
  tool: ToolName;
  input: Record<string, unknown>;
  /** IDs of nodes whose output must be ready before this node can execute. */
  dependsOn?: string[];
  /** When set, the node result is cached by (tool + input) hash for the given TTL. */
  cache?: { ttlSeconds: number };
}

export interface PipelineResult {
  success: boolean;
  result: unknown;
  error?: string;
  fromCache?: boolean;
}

export interface PipelineExecution {
  id: string;
  nodes: PipelineNode[];
  status: 'pending' | 'running' | 'completed' | 'error';
  results: Record<string, PipelineResult>;
  startedAt: number;
  completedAt?: number;
}

// ─── Progress events ──────────────────────────────────────────────────────────

/** Emitted as the pipeline advances. Safe to serialize as JSON. */
export type PipelineEvent =
  | {
      type: 'execution_start';
      executionId: string;
      totalNodes: number;
    }
  | {
      type: 'wave_start';
      waveIndex: number;
      nodeIds: string[];
      tools: string[];
    }
  | {
      type: 'node_complete';
      waveIndex: number;
      nodeId: string;
      tool: string;
      success: boolean;
      fromCache: boolean;
    }
  | {
      type: 'wave_complete';
      waveIndex: number;
      successCount: number;
      totalCount: number;
    }
  | {
      type: 'execution_complete';
      executionId: string;
      status: 'completed' | 'error';
      durationMs: number;
    }
  | {
      type: 'error';
      nodeId?: string;
      message: string;
    };

export type PipelineProgressCallback = (event: PipelineEvent) => void;

// ─── Cache key ────────────────────────────────────────────────────────────────

function buildNodeCacheKey(node: PipelineNode): string {
  const fingerprint = JSON.stringify({ tool: node.tool, input: node.input });
  return `pipeline:node:${createHash('sha256').update(fingerprint).digest('hex')}`;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

class PipelineEngine {
  /**
   * Execute a list of nodes respecting `dependsOn` constraints.
   *
   * Nodes whose dependencies are all satisfied form a "wave" and are executed
   * in parallel via `Promise.all`. The pipeline repeats until all nodes have
   * run or a node fails (non-success result stops further waves).
   *
   * Callers can pass `onProgress` to receive real-time events as each wave
   * and node transitions state — suitable for piping into an SSE stream.
   */
  async executePipeline(
    nodes: PipelineNode[],
    onProgress?: PipelineProgressCallback
  ): Promise<PipelineExecution> {
    const executionId = `exec-${Date.now()}`;
    const execution: PipelineExecution = {
      id: executionId,
      nodes,
      status: 'running',
      results: {},
      startedAt: Date.now(),
    };

    onProgress?.({
      type: 'execution_start',
      executionId,
      totalNodes: nodes.length,
    });

    const completed = new Set<string>();
    const remaining = [...nodes];
    let waveIndex = 0;

    while (remaining.length > 0) {
      // Nodes whose every dependency has already completed
      const wave = remaining.filter((n) =>
        (n.dependsOn ?? []).every((dep) => completed.has(dep))
      );

      if (wave.length === 0) {
        // Unsatisfiable dependencies (cycle or missing node)
        execution.status = 'error';
        onProgress?.({ type: 'error', message: 'Unsatisfiable pipeline dependencies' });
        break;
      }

      onProgress?.({
        type: 'wave_start',
        waveIndex,
        nodeIds: wave.map((n) => n.id),
        tools: wave.map((n) => n.tool as string),
      });

      // Run the entire wave concurrently
      const waveResults = await Promise.all(
        wave.map(async (node): Promise<{ node: PipelineNode; result: PipelineResult }> => {
          try {
            // Cache read
            if (node.cache) {
              const key = buildNodeCacheKey(node);
              const cached = await cacheGet<PipelineResult>(key);
              if (cached) {
                const result = { ...cached, fromCache: true };
                onProgress?.({
                  type: 'node_complete',
                  waveIndex,
                  nodeId: node.id,
                  tool: node.tool as string,
                  success: true,
                  fromCache: true,
                });
                return { node, result };
              }
            }

            const result = await executeTool(node.tool, node.input);

            // Cache write on success
            if (node.cache && result.success) {
              const key = buildNodeCacheKey(node);
              await cacheSet(key, result, node.cache.ttlSeconds);
            }

            onProgress?.({
              type: 'node_complete',
              waveIndex,
              nodeId: node.id,
              tool: node.tool as string,
              success: result.success,
              fromCache: false,
            });

            return { node, result };
          } catch (error) {
            const message = (error as Error).message;
            onProgress?.({
              type: 'node_complete',
              waveIndex,
              nodeId: node.id,
              tool: node.tool as string,
              success: false,
              fromCache: false,
            });
            onProgress?.({ type: 'error', nodeId: node.id, message });
            return {
              node,
              result: { success: false, result: null, error: message },
            };
          }
        })
      );

      let successCount = 0;
      let hasError = false;

      for (const { node, result } of waveResults) {
        execution.results[node.id] = result;
        if (result.success) {
          completed.add(node.id);
          successCount++;
        } else {
          hasError = true;
        }
      }

      onProgress?.({
        type: 'wave_complete',
        waveIndex,
        successCount,
        totalCount: wave.length,
      });

      // Remove processed nodes from the queue regardless of outcome
      for (const n of wave) {
        const idx = remaining.indexOf(n);
        if (idx >= 0) remaining.splice(idx, 1);
      }

      if (hasError) {
        execution.status = 'error';
        break;
      }

      waveIndex++;
    }

    execution.status = execution.status === 'error' ? 'error' : 'completed';
    execution.completedAt = Date.now();

    onProgress?.({
      type: 'execution_complete',
      executionId,
      status: execution.status,
      durationMs: execution.completedAt - execution.startedAt,
    });

    return execution;
  }

  /**
   * Alias for `executePipeline`. The wave-based executor already handles
   * topological ordering, so an explicit sort step is no longer needed.
   */
  async executeWorkflow(
    nodes: PipelineNode[],
    onProgress?: PipelineProgressCallback
  ): Promise<PipelineExecution> {
    return this.executePipeline(nodes, onProgress);
  }
}

export const pipelineEngine = new PipelineEngine();
