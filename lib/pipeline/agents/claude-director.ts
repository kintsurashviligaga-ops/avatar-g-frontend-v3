// Master Prompt §4 / B.2 — Phase 1 Central Director. Turns a raw user prompt into a
// strictly-validated OrchestrationOutput (5 scenes, dual-mode). On a schema miss it
// re-prompts ONCE with the validation error appended — a self-correction loop that
// sharply raises first-try success without a human in the loop.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, AgentContext } from './base-agent';
import { OrchestrationOutputSchema, OrchestrationOutput } from '../schemas/orchestration-output.schema';

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL || 'claude-3-5-sonnet-20241022';

const SYSTEM_PROMPT = `You are the Central Director for MyAvatar.ge.
Given a user prompt, produce EXACTLY 5 scenes of 6 seconds each (30s total).
Classify intent as 'cinematic' or 'b2b_commercial'.
For each scene provide: sceneNumber (1..5 in order), a cinematicPrompt (lens, camera motion,
lighting), a dialogueScript (<= ~15 words so it fits 6 seconds), a foleySfxDescription, and
for b2b_commercial a marketingMetadata object (overlayText / priceTag / cta / website) on at
least one scene. Also provide masterTheme and a globalMusicPrompt for one continuous 30s score.
Match the user's language. Return ONLY raw JSON — no markdown fences, no prose.`;

export class ClaudeDirectorAgent extends BaseAgent {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor() {
    super('ClaudeDirector', 20000);
  }

  async direct(ctx: AgentContext, userPrompt: string): Promise<OrchestrationOutput> {
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.guarded(ctx, () => this.callModel(userPrompt, lastError));
      let json: unknown;
      try {
        json = JSON.parse(this.stripFences(raw));
      } catch {
        lastError = 'output was not valid JSON';
        continue;
      }
      const parsed = OrchestrationOutputSchema.safeParse(json);
      if (parsed.success) return parsed.data;
      lastError = JSON.stringify(parsed.error.issues);
    }
    throw new Error(`Director failed schema validation: ${lastError}`);
  }

  private stripFences(s: string): string {
    return s
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
  }

  private async callModel(userPrompt: string, validationError: string | null): Promise<string> {
    const correction = validationError
      ? `\n\nYour previous output failed validation with: ${validationError}. Fix it and return ONLY raw JSON.`
      : '';
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt + correction }],
    });
    const block = res.content.find((b) => b.type === 'text');
    return block && 'text' in block ? (block as { text: string }).text.trim() : '';
  }
}
