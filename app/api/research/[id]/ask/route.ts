/**
 * POST /api/research/[id]/ask — talk to a FINISHED report in text. Body: { mode?: 'ask' | 'summarize' | 'takeaways', question?, locale? }
 *
 *   200 { answer, truncated }     Markdown; `truncated` = the report was long and the model saw every section, shortened
 *   401 no session · 404 not the caller's job · 409 not_ready (the report is not finished — or never will be) ·
 *   429 the per-minute / daily allowance · 503 the platform's AI budget is spent, or the model could not answer
 *
 * A normal Gemini Flash call carrying the report (lib/research/qa.ts) — cheap, capped, budget-gated (chatBudgetAllows before,
 * bookChatUsage after) and free to the user like the chat itself. NOT the research agent: asking never costs credits and never
 * re-runs the research. ⚠️ vercel.json grants app/api/** 15 s and overrides this file's maxDuration; the model call gives up at
 * 11 s so the route always answers. (An owner who wants longer answers adds a `functions` entry for this route.)
 */
import { NextRequest } from 'next/server';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { signInToGenerateBody } from '@/lib/auth/generationGate';
import { generateWithGemini, GEMINI_MODELS } from '@/lib/gemini/client';
import { reportError } from '@/lib/observability/report-error';
import { callerId, json } from '@/lib/research/http';
import { researchMessage } from '@/lib/research/messages';
import { answerAboutReport } from '@/lib/research/qa';
import { RESEARCH_ASK_DAY_USER, RESEARCH_ASK_MIN_USER } from '@/lib/research/rateLimits';
import { isJobId, parseAskBody } from '@/lib/research/request';
import { getResearchRuntime } from '@/lib/research/runtime';
import { bookChatUsage, chatBudgetAllows } from '@/lib/services/billing/chatBudget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const ASK_MESSAGES = {
  budget_exhausted: {
    ka: 'ამ წუთას AI-ის დღიური ბიუჯეტი ამოიწურა. სცადე მოგვიანებით.',
    en: 'The platform’s AI budget is used up for now. Please try again later.',
    ru: 'Дневной AI-бюджет платформы исчерпан. Попробуйте позже.',
  },
  unavailable: {
    ka: 'პასუხის მომზადება ვერ მოხერხდა. სცადე თავიდან.',
    en: 'We could not prepare an answer. Please try again.',
    ru: 'Не удалось подготовить ответ. Попробуйте снова.',
  },
  empty_answer: {
    ka: 'ამ კითხვაზე პასუხი ვერ მივიღეთ. სცადე სხვაგვარად ჩამოაყალიბო.',
    en: 'We did not get an answer to that. Try rephrasing the question.',
    ru: 'Ответа на этот вопрос получить не удалось. Попробуйте переформулировать.',
  },
  not_ready: {
    ka: 'ანგარიში ჯერ არ არის მზად.',
    en: 'The report is not ready yet.',
    ru: 'Отчёт ещё не готов.',
  },
} as const;
const askMsg = (k: keyof typeof ASK_MESSAGES, loc?: string) => ASK_MESSAGES[k][loc === 'en' || loc === 'ru' ? loc : 'ka'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await callerId(req);
  if (!userId) return json(signInToGenerateBody(), 401);

  const raw = await req.json().catch(() => null);
  const parsed = parseAskBody(raw);
  if (!parsed.ok) return json({ error: 'invalid_request', reasons: parsed.reasons, message: researchMessage('invalid_request') }, 400);
  const body = parsed.value;

  const burst = await checkRateLimitByKey(userId, RESEARCH_ASK_MIN_USER);
  if (burst) return burst;
  const daily = await checkRateLimitByKey(userId, RESEARCH_ASK_DAY_USER);
  if (daily) return daily;
  // The shared per-account chat ceiling too: a question is a model turn like any other.
  const chat = await checkRateLimitByKey(userId, RATE_LIMITS.CHAT_USER);
  if (chat) return chat;

  const id = params?.id;
  if (!isJobId(id)) return json({ error: 'not_found', message: researchMessage('not_found', body.locale) }, 404);
  const rt = getResearchRuntime();
  if (!rt) return json({ error: 'unavailable', message: askMsg('unavailable', body.locale) }, 503);

  let job;
  try {
    job = await rt.store.getForUser(id, userId);
  } catch (e) {
    reportError(e, { route: '/api/research/[id]/ask', stage: 'load' });
    return json({ error: 'unavailable', message: askMsg('unavailable', body.locale) }, 503);
  }
  if (!job) return json({ error: 'not_found', message: researchMessage('not_found', body.locale) }, 404);
  if (job.status !== 'completed' || !job.report_md) return json({ error: 'not_ready', message: askMsg('not_ready', body.locale) }, 409);

  const out = await answerAboutReport(
    {
      generate: async (r) => {
        try {
          return await generateWithGemini({ prompt: r.prompt, systemPrompt: r.systemPrompt, tier: 'flash', maxTokens: r.maxTokens, temperature: 0.2, thinkingBudget: 0, timeoutMs: r.timeoutMs });
        } catch (e) {
          // The message carries Google's body — it is logged here and never leaves the server.
          reportError(e, { route: '/api/research/[id]/ask', stage: 'model' });
          throw e;
        }
      },
      budgetAllows: (text) => chatBudgetAllows(text, GEMINI_MODELS.flash),
      book: (u) => bookChatUsage(u),
    },
    { userId, report: job.report_md, title: job.title, mode: body.mode, question: body.question, locale: body.locale },
  );

  if (out.ok) return json({ answer: out.answer, truncated: out.truncated });
  return json({ error: out.code, message: askMsg(out.code, body.locale) }, out.code === 'empty_answer' ? 502 : 503);
}
