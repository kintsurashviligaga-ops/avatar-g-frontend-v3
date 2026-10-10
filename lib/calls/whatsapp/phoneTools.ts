/**
 * lib/calls/whatsapp/phoneTools.ts — what Agent G can DO during a WhatsApp voice call, and the server that does it.
 *
 * ONE BRAIN. A phone call runs the same Gemini Live model, the same platform prompt, the same memory and the same task
 * engine, approval rules, ledger and Library as the browser's Live Voice (app/api/voice/live). What differs is only what
 * a phone can do: the browser's screen tools (click, scroll, open a panel, show code …) mean nothing on a phone, so a
 * call declares this short list instead, and each call is executed HERE, on the server, for the ticket's user only.
 *
 * Scope follows Meta's answer on its Terms §4.7 (the owner's 16:20Z message: present both scenarios, decide on Meta's
 * written word). WHATSAPP_AGENT_SCOPE:
 *   'service'  (default)  the account, orders and tasks: balance, status, stop, send the result here, call me back.
 *   'creative'            adds ordering work by voice (today: an MP3 from a link; more as WhatsApp files reach the
 *                         task engine), always with a spoken price and an explicit confirm.
 *
 * MONEY. The model's word is never an approval. Free work starts on the person's own spoken yes, judged by the server
 * from the call's input transcription (lib/voice/spokenYes, the same judge as Live Voice), never from what the model
 * says. Paid work never starts from a call at all: Agent G says the price and a WhatsApp message with a Confirm button
 * arrives in the same chat; only that tap, from the linked number, starts it (lib/calls/whatsapp/confirm.ts). Caller ID
 * alone authorizes nothing (owner, 13:10Z).
 */
import type { LiveSchema } from '@/lib/voice/liveTools';
import { judgeSince, type HeardUtterance } from '@/lib/voice/spokenYes';
import type { TaskView } from '@/lib/tasks/taskView';
import type { CallTicket } from './ticket';

export const PHONE_TOOL_NAMES = [
  'account_summary', 'task_status', 'stop_task', 'send_result', 'call_me_when_ready', 'order_mp3', 'start_order', 'end_call',
] as const;
export type PhoneToolName = (typeof PHONE_TOOL_NAMES)[number];

export type AgentScope = 'service' | 'creative';
const CREATIVE_ONLY: ReadonlySet<PhoneToolName> = new Set<PhoneToolName>(['order_mp3', 'start_order']);

export interface PhoneFunctionDeclaration {
  readonly name: PhoneToolName;
  readonly description: string;
  readonly parameters?: LiveSchema;
}

const TASK_NO: LiveSchema = { type: 'INTEGER', description: 'The task number from task_status (1 = the newest).' };

const ALL: readonly PhoneFunctionDeclaration[] = Object.freeze([
  {
    name: 'account_summary',
    description: 'The caller\'s balance in credits and how many of their tasks are running or finished today. Use it when they ask about their balance or account.',
  },
  {
    name: 'task_status',
    description: 'The caller\'s newest tasks (videos, images, music, MP3s, edits) with a number, what each is and what it is doing now. '
      + 'Never guess a status: call this whenever they ask what a task is doing. task = one task number for its details.',
    parameters: { type: 'OBJECT', properties: { task: TASK_NO } },
  },
  {
    name: 'stop_task',
    description: 'Stop one running task. First tell the caller which task and that stopping cannot be undone, and ask them; call this only '
      + 'after they clearly say yes. The server checks their own words, not yours.',
    parameters: { type: 'OBJECT', properties: { task: TASK_NO }, required: ['task'] },
  },
  {
    name: 'send_result',
    description: 'Send a finished task\'s file (video, MP3, image) into this WhatsApp chat. Large files arrive as a link that opens only '
      + 'for the caller after they sign in. It is always in their Library too.',
    parameters: { type: 'OBJECT', properties: { task: TASK_NO } },
  },
  {
    name: 'call_me_when_ready',
    description: 'Ask to call the caller back on WhatsApp when a running task finishes. The result is sent here as a message first; a call '
      + 'only follows if they allowed Agent G calls in WhatsApp, inside their call hours. Say that plainly.',
    parameters: { type: 'OBJECT', properties: { task: TASK_NO }, required: ['task'] },
  },
  {
    name: 'order_mp3',
    description: 'Plan an MP3 (192 kbps) from the sound of a video or audio LINK the caller gives. Nothing starts yet: you get the plan '
      + 'number and its price. Video platforms (YouTube, TikTok, Instagram, Facebook, Vimeo and the like) are refused by their terms: '
      + 'never look for a way around that; tell the caller to send their own file in this chat instead.',
    parameters: {
      type: 'OBJECT',
      properties: { url: { type: 'STRING', description: 'The full http(s) address the caller gave (at most 2048 characters).' } },
      required: ['url'],
    },
  },
  {
    name: 'start_order',
    description: 'Start plan `plan`. Tell the caller what it does and its price first. A free plan starts only if their own words after '
      + 'that were a clear yes. A paid plan never starts from the call: a Confirm button is sent to this WhatsApp chat and it starts '
      + 'when they tap it. Tell them to tap it.',
    parameters: { type: 'OBJECT', properties: { plan: { type: 'INTEGER', description: 'The plan number from order_mp3.' } }, required: ['plan'] },
  },
  {
    name: 'end_call',
    description: 'End this call. Use it when the caller says goodbye or asks to hang up, after a short goodbye.',
  },
] as PhoneFunctionDeclaration[]);

export function phoneDeclarations(scope: AgentScope): readonly PhoneFunctionDeclaration[] {
  return scope === 'creative' ? ALL : ALL.filter((d) => !CREATIVE_ONLY.has(d.name));
}

export function agentScope(env: NodeJS.ProcessEnv = process.env): AgentScope {
  return (env.WHATSAPP_AGENT_SCOPE ?? '').trim().toLowerCase() === 'creative' ? 'creative' : 'service';
}

/** The last block of the phone call's system instruction (after the shared platform prompt, memory and the chat). */
export function phoneCallRule(scope: AgentScope, supportEmail: string): string {
  return [
    'WHATSAPP VOICE CALL: you are Agent G on a WhatsApp call with a signed-in MyAvatar.ge customer whose number is linked to their account.',
    'Everything you say is spoken: short natural sentences, no lists, no Markdown, no links read aloud. Answer in the caller\'s language.',
    'You help with their own account, orders, tasks, prices and results, and deliver what they ordered into this WhatsApp chat.',
    scope === 'creative'
      ? 'You may plan an order they ask for with your functions, always saying what it does and its price before anything starts.'
      : 'To create something new, tell them to use the website or write in this chat; you cannot start new work in this call.',
    'Use only your functions for facts about tasks, balance and prices; never guess one. Paid work starts only from the Confirm button in this chat.',
    'You cannot browse the web, answer general questions unrelated to MyAvatar.ge, or act as a general assistant on this call: say so politely.',
    `If they want a person, give the support address ${supportEmail} and offer to end the call.`,
  ].join(' ');
}

// ─── The executor ────────────────────────────────────────────────────────────────────────────────────────────────

export interface PhonePlan {
  n: number;
  /** The run spec and its signed plan token (lib/agent/run/runExec planRun), kept server-side only. */
  spec: unknown;
  token: string;
  credits: number;
  label: string;
  /** When the plan (and its price) was told; a spoken yes must come after this. */
  toldAt: number;
}

export interface PhoneToolDeps {
  now(): number;
  scope: AgentScope;
  /** AGENT_G_MEDIA_EXEC open to this user (the same gate as the website's Agent G runs). */
  mediaOpen(userId: string): Promise<boolean>;
  balance(userId: string): Promise<number | null>;
  listTasks(userId: string): Promise<TaskView[]>;
  cancelTask(userId: string, taskId: string): Promise<'cancelled' | 'not_found' | 'not_cancellable' | 'failed'>;
  heard(callId: string): Promise<HeardUtterance[]>;
  plans: { list(callId: string): Promise<PhonePlan[]>; add(callId: string, p: Omit<PhonePlan, 'n'>): Promise<PhonePlan> };
  planMp3(userId: string, url: string): Promise<{ ok: true; spec: unknown; token: string; credits: number; label: string } | { ok: false; error: string }>;
  startFree(userId: string, plan: PhonePlan, said: string): Promise<{ ok: true; taskId: string } | { ok: false; error: string }>;
  /** Send the Confirm button for a paid plan to the linked number. */
  sendConfirm(userId: string, plan: PhonePlan): Promise<boolean>;
  deliver(userId: string, task: TaskView): Promise<{ sent: boolean; mode: 'media' | 'link' | 'none'; reason?: string }>;
  scheduleCallback(userId: string, task: TaskView): Promise<'scheduled' | 'needs_permission' | 'unavailable'>;
}

export type PhoneToolResponse = Record<string, unknown>;

/** How long after the question a yes still counts for stopping a task. */
const STOP_YES_WINDOW_MS = 60_000;

const taskNo = (args: Record<string, unknown>): number | null => {
  const n = Number(args.task);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
};

function spoken(t: TaskView, n: number): Record<string, unknown> {
  return {
    task: n,
    what: t.label ?? t.service,
    status: t.status,
    ...(typeof t.pct === 'number' ? { percent: Math.round(t.pct) } : {}),
    ...(t.stage ? { stage: t.stage } : {}),
    has_result: !!t.result,
    ...(t.error ? { problem: t.error } : {}),
  };
}

/**
 * Run one function call from the model for the ticket's user. Never throws; every answer is a plain object Gemini reads
 * back. Unknown or out-of-scope names answer `unknown_tool` (the declaration list is the allowlist).
 */
export async function runPhoneTool(
  deps: PhoneToolDeps,
  ticket: Pick<CallTicket, 'callId' | 'userId'>,
  name: unknown,
  rawArgs: unknown,
): Promise<PhoneToolResponse> {
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  const allowed = phoneDeclarations(deps.scope).some((d) => d.name === name);
  if (typeof name !== 'string' || !allowed) return { error: 'unknown_tool' };
  const { userId, callId } = ticket;
  try {
    switch (name as PhoneToolName) {
      case 'account_summary': {
        const [balance, tasks] = await Promise.all([deps.balance(userId), deps.listTasks(userId)]);
        const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'awaiting_approval').length;
        return { balance_credits: balance, running_tasks: running, recent_tasks: tasks.length };
      }
      case 'task_status': {
        const tasks = (await deps.listTasks(userId)).slice(0, 5);
        const n = taskNo(args);
        if (n) return tasks[n - 1] ? spoken(tasks[n - 1]!, n) : { error: 'no_such_task' };
        return { tasks: tasks.map((t, i) => spoken(t, i + 1)) };
      }
      case 'stop_task': {
        const n = taskNo(args);
        const task = n ? (await deps.listTasks(userId)).slice(0, 5)[n - 1] : undefined;
        if (!task) return { error: 'no_such_task' };
        const { verdict } = judgeSince(await deps.heard(callId), deps.now() - STOP_YES_WINDOW_MS);
        if (verdict !== 'yes') return { stopped: false, reason: verdict === 'no' ? 'said_no' : 'not_heard_yes' };
        const r = await deps.cancelTask(userId, task.id);
        return { stopped: r === 'cancelled', ...(r === 'cancelled' ? {} : { reason: r }) };
      }
      case 'send_result': {
        const tasks = (await deps.listTasks(userId)).slice(0, 5);
        const n = taskNo(args);
        const task = n ? tasks[n - 1] : tasks.find((t) => t.result);
        if (!task) return { error: 'no_such_task' };
        if (!task.result) return { sent: false, reason: 'not_finished' };
        const r = await deps.deliver(userId, task);
        return { sent: r.sent, how: r.mode, ...(r.reason ? { reason: r.reason } : {}) };
      }
      case 'call_me_when_ready': {
        const n = taskNo(args);
        const task = n ? (await deps.listTasks(userId)).slice(0, 5)[n - 1] : undefined;
        if (!task) return { error: 'no_such_task' };
        if (task.result) return { scheduled: false, reason: 'already_finished' };
        return { result: await deps.scheduleCallback(userId, task) };
      }
      case 'order_mp3': {
        if (!(await deps.mediaOpen(userId))) return { error: 'not_available' };
        const url = typeof args.url === 'string' ? args.url.trim() : '';
        if (!/^https?:\/\/\S{3,2040}$/i.test(url)) return { error: 'bad_link' };
        const p = await deps.planMp3(userId, url);
        if (!p.ok) return { planned: false, reason: p.error };
        const plan = await deps.plans.add(callId, { spec: p.spec, token: p.token, credits: p.credits, label: p.label, toldAt: deps.now() });
        return { planned: true, plan: plan.n, what: plan.label, price_credits: plan.credits, free: plan.credits === 0 };
      }
      case 'start_order': {
        if (!(await deps.mediaOpen(userId))) return { error: 'not_available' };
        const plans = await deps.plans.list(callId);
        const n = Number(args.plan);
        const plan = plans.find((p) => p.n === n);
        if (!plan) return { error: 'no_such_plan' };
        if (plan.credits > 0) {
          const sent = await deps.sendConfirm(userId, plan);
          return sent ? { started: false, waiting_for: 'confirm_button', price_credits: plan.credits } : { started: false, reason: 'confirm_not_sent' };
        }
        const { verdict, said } = judgeSince(await deps.heard(callId), plan.toldAt);
        if (verdict !== 'yes') return { started: false, reason: verdict === 'no' ? 'said_no' : 'not_heard_yes' };
        const r = await deps.startFree(userId, plan, said);
        return r.ok ? { started: true } : { started: false, reason: r.error };
      }
      case 'end_call':
        return { ending: true };
    }
  } catch (error) {
    console.warn('[WhatsApp.Calls] tool_failed', { tool: name, error: error instanceof Error ? error.name : 'unknown' });
    return { error: 'failed' };
  }
  return { error: 'unknown_tool' };
}
