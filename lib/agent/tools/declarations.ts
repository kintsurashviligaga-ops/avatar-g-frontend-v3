/**
 * lib/agent/tools/declarations.ts — Agent G's typed registry (./registry) as Gemini function declarations, and the way a
 * model's function call comes back through it. Pure, no network: the request that hands these to a model, and the
 * comparison against the deterministic router (lib/agent/intent), live elsewhere.
 *
 * ONE SOURCE. The declarations are generated from the same zod schemas bindTools parses with, so what the model is told
 * and what the server accepts cannot drift apart. A schema this file cannot express fails here, at load, in its test.
 *
 * ⚠️ A FUNCTION CALL IS A REQUEST, NEVER AN AUTHORIZATION. Only the registry's tools are declared, and their effects are
 * read / prepare / quote: nothing a model can call starts a job, spends a credit or touches the user's data. The
 * confirmed actions (CONFIRMED_ACTIONS) are never declared; they run only on the user's own press, through a route that
 * holds the session and the signed quote. A call is answered by bindTools: an unknown name, a bad input or a call over
 * the limit comes back as an observation the model can correct, never as an action. The call id is kept, so parallel
 * calls are answered one to one.
 *
 * The schema is the OpenAPI subset Gemini takes (type, description, enum, properties, required, items, nullable,
 * minimum, maximum). String and array bounds go into the description; the parse enforces them either way.
 */
import { z } from 'zod';
import type { AgentTool } from '@/lib/agent/react/coordinator';
import type { ToolSpec } from './registry';

export type GeminiType = 'OBJECT' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY';

export interface GeminiSchema {
  type: GeminiType;
  description?: string;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  /** Omitted for a tool with no arguments (an empty OBJECT is refused by some Gemini surfaces). */
  parameters?: GeminiSchema;
}

const join = (...parts: Array<string | undefined>): string | undefined => {
  const s = parts.filter((p) => p && p.trim()).join(' ').trim();
  return s || undefined;
};

type Def = { typeName?: string; description?: string; [k: string]: unknown };
const defOf = (s: z.ZodTypeAny): Def => (s as unknown as { _def: Def })._def;

interface Check { kind: string; value?: number; inclusive?: boolean }
const checksOf = (d: Def): Check[] => (Array.isArray(d.checks) ? (d.checks as Check[]) : []);

/** One zod schema as a Gemini schema. Throws on a type the subset cannot say (caught by the declarations test). */
export function geminiSchemaOf(schema: z.ZodTypeAny): GeminiSchema {
  const d = defOf(schema);
  const own = d.description;
  switch (d.typeName) {
    case 'ZodOptional':
    case 'ZodDefault':
    case 'ZodReadonly': {
      const inner = geminiSchemaOf(d.innerType as z.ZodTypeAny);
      return own ? { ...inner, description: join(own, inner.description) } : inner;
    }
    case 'ZodNullable': {
      const inner = geminiSchemaOf(d.innerType as z.ZodTypeAny);
      return { ...inner, nullable: true, ...(own ? { description: join(own, inner.description) } : {}) };
    }
    case 'ZodEffects': {
      // preprocess / refine / transform: the model sends what the inner schema takes.
      const inner = geminiSchemaOf(d.schema as z.ZodTypeAny);
      return own ? { ...inner, description: join(own, inner.description) } : inner;
    }
    case 'ZodString': {
      const c = checksOf(d);
      const min = c.find((x) => x.kind === 'min')?.value;
      const max = c.find((x) => x.kind === 'max')?.value;
      const fmt = c.some((x) => x.kind === 'url') ? 'A URL.' : undefined;
      const bound = max !== undefined ? `At most ${max} characters.` : min !== undefined && min > 1 ? `At least ${min} characters.` : undefined;
      const description = join(own, fmt, bound);
      return { type: 'STRING', ...(description ? { description } : {}) };
    }
    case 'ZodNumber': {
      const c = checksOf(d);
      const int = c.some((x) => x.kind === 'int');
      const min = c.find((x) => x.kind === 'min');
      const max = c.find((x) => x.kind === 'max');
      return {
        type: int ? 'INTEGER' : 'NUMBER',
        ...(own ? { description: own } : {}),
        ...(min?.value !== undefined ? { minimum: min.value } : {}),
        ...(max?.value !== undefined ? { maximum: max.value } : {}),
      };
    }
    case 'ZodBoolean':
      return { type: 'BOOLEAN', ...(own ? { description: own } : {}) };
    case 'ZodEnum':
      return { type: 'STRING', enum: [...(d.values as string[])], ...(own ? { description: own } : {}) };
    case 'ZodLiteral': {
      if (typeof d.value !== 'string') throw new Error(`a non-string literal cannot be declared (${String(d.value)})`);
      return { type: 'STRING', enum: [d.value], ...(own ? { description: own } : {}) };
    }
    case 'ZodArray': {
      const max = (d.maxLength as { value?: number } | null)?.value;
      const description = join(own, max !== undefined ? `At most ${max} items.` : undefined);
      return { type: 'ARRAY', items: geminiSchemaOf(d.type as z.ZodTypeAny), ...(description ? { description } : {}) };
    }
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, GeminiSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = geminiSchemaOf(value as z.ZodTypeAny);
        if (!(value as z.ZodTypeAny).isOptional()) required.push(key);
      }
      return { type: 'OBJECT', properties, ...(required.length ? { required } : {}), ...(own ? { description: own } : {}) };
    }
    default:
      throw new Error(`zod type ${String(d.typeName)} has no Gemini schema`);
  }
}

/** The declarations for one request: the offered tools of the registry, in its order. */
export function toolDeclarations<C>(specs: ReadonlyArray<ToolSpec<C>>, ctx?: C): FunctionDeclaration[] {
  return specs
    .filter((s) => ctx === undefined || !s.offered || s.offered(ctx))
    .map((s) => {
      const parameters = geminiSchemaOf(s.input);
      const empty = parameters.type === 'OBJECT' && !Object.keys(parameters.properties ?? {}).length;
      return { name: s.name, description: s.description, ...(empty ? {} : { parameters }) };
    });
}

/** One function call as a Gemini response carries it (candidates[].content.parts[].functionCall). */
export interface FunctionCall {
  id?: string;
  name: string;
  args?: unknown;
}

/** The function calls in a generateContent response, in order. Anything that is not one is skipped. */
export function functionCallsOf(response: unknown): FunctionCall[] {
  const parts = (response as { candidates?: Array<{ content?: { parts?: unknown[] } }> } | null)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  const out: FunctionCall[] = [];
  for (const p of parts) {
    const fc = (p as { functionCall?: { id?: unknown; name?: unknown; args?: unknown } } | null)?.functionCall;
    if (!fc || typeof fc.name !== 'string' || !fc.name) continue;
    out.push({ ...(typeof fc.id === 'string' && fc.id ? { id: fc.id } : {}), name: fc.name, ...(fc.args !== undefined ? { args: fc.args } : {}) });
  }
  return out;
}

/** What goes back to the model for one call: the same id and name, the tool's answer as an object. */
export interface FunctionResult {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { result: v ?? null };

/**
 * Answer one call through the bound registry (bindTools: parse, limit, never throw). A name that is not a bound tool is
 * refused as an observation: the model asked for something this request was not given.
 */
export async function callDeclaredTool(tools: readonly AgentTool[], call: FunctionCall): Promise<FunctionResult> {
  const tool = tools.find((t) => t.name === call.name);
  const base = { ...(call.id ? { id: call.id } : {}), name: call.name };
  if (!tool) return { ...base, response: { error: 'unknown_tool', message: `No tool named ${call.name} is available here.` } };
  try {
    return { ...base, response: asObject(await tool.run(call.args ?? {})) };
  } catch (e) {
    return { ...base, response: { error: 'tool_failed', message: e instanceof Error ? e.message.slice(0, 200) : 'the tool failed' } };
  }
}

/** Every call of one model turn, answered in order (one result per call, ids kept). */
export async function answerFunctionCalls(tools: readonly AgentTool[], calls: readonly FunctionCall[]): Promise<FunctionResult[]> {
  const out: FunctionResult[] = [];
  for (const c of calls) out.push(await callDeclaredTool(tools, c));
  return out;
}

/** The parts that carry the answers back, in the shape generateContent takes (`functionResponse`). */
export const functionResponseParts = (results: readonly FunctionResult[]) =>
  results.map((r) => ({ functionResponse: { ...(r.id ? { id: r.id } : {}), name: r.name, response: r.response } }));
