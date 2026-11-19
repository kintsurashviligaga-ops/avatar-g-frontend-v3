/**
 * pilots/adk/src/fakeLlm.ts — scripted fake models for the pilot's tests (MASTER TASK v3.1 §2.4: "First tests use
 * fake models and tools"). No network, no key, no cost. Each model call takes the next step of the script; a step
 * can be text, tool calls, a function of the request (a naive model that does whatever the last tool result says),
 * or a hang that only ends when the run is cancelled.
 */
import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from '@google/adk';
import type { Content, Part } from '@google/genai';
import type { PricedModel } from './agent';

export type ScriptStep =
  | { text: string }
  | { calls: Array<{ name: string; args?: Record<string, unknown> }> }
  | { hang: true }
  | ((request: LlmRequest) => ScriptStep);

/** The function responses the model is shown in a request, newest last. */
export function functionResponses(request: LlmRequest): Array<{ name: string; response: Record<string, unknown> }> {
  const out: Array<{ name: string; response: Record<string, unknown> }> = [];
  for (const c of request.contents as Content[]) {
    for (const p of (c.parts ?? []) as Part[]) {
      if (p.functionResponse) out.push({ name: p.functionResponse.name ?? '', response: (p.functionResponse.response ?? {}) as Record<string, unknown> });
    }
  }
  return out;
}

const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

/** A scripted model that cannot say what a call costs: the pilot must treat it as over any budget. */
export class UnpricedScriptedLlm extends BaseLlm {
  /** Every request that actually reached the model. */
  readonly requests: LlmRequest[] = [];
  private next = 0;
  private callSeq = 0;

  constructor(private readonly script: readonly ScriptStep[]) {
    super({ model: 'scripted-fake' });
  }

  async *generateContentAsync(request: LlmRequest, _stream?: boolean, abortSignal?: AbortSignal): AsyncGenerator<LlmResponse, void> {
    // A copy of what the model was sent: the conversation, the instruction and the declared tools.
    this.requests.push(structuredClone({
      contents: request.contents,
      config: { systemInstruction: request.config?.systemInstruction, tools: request.config?.tools },
    }) as LlmRequest);
    let step: ScriptStep = this.script[this.next++] ?? { text: 'Done.' };
    while (typeof step === 'function') step = step(request);
    if ('hang' in step) {
      await new Promise<never>((_, reject) => {
        if (abortSignal?.aborted) return reject(abortError());
        abortSignal?.addEventListener('abort', () => reject(abortError()), { once: true });
      });
      return;
    }
    if ('text' in step) {
      yield { content: { role: 'model', parts: [{ text: step.text }] }, turnComplete: true };
      return;
    }
    yield {
      content: {
        role: 'model',
        parts: step.calls.map((c) => ({ functionCall: { id: `call_${++this.callSeq}`, name: c.name, args: c.args ?? {} } })),
      },
      turnComplete: true,
    };
  }

  async connect(): Promise<BaseLlmConnection> {
    throw new Error('The pilot has no live connection.');
  }
}

/** A scripted model that says each call costs `usd` (0 by default: a fake costs nothing). */
export class ScriptedLlm extends UnpricedScriptedLlm implements PricedModel {
  constructor(script: readonly ScriptStep[], private readonly usd = 0) {
    super(script);
  }

  pilotCallUsd(): number {
    return this.usd;
  }
}
