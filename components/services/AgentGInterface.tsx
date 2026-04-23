'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic2, Paperclip, SendHorizonal } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import type { PanelRunCallbacks, SupportedLocale, WorkspaceResult } from '@/types/dashboard';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AgentGInterfaceProps = {
  locale?: SupportedLocale;
  callbacks?: PanelRunCallbacks;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  sendLabel?: string;
  streamEndpoint?: string;
  initialMessages?: Message[];
  allowAttachments?: boolean;
  allowVoiceToggle?: boolean;
  assistantBadge?: string;
};

const COPY = {
  en: {
    title: 'Agent G',
    subtitle: 'Streaming command window for planning, prompting, and cross-service execution.',
    placeholder: 'Ask Agent G to plan, route, or create something...',
    send: 'Send',
    typing: 'Agent G is responding...',
    welcome: 'Hello. I am Agent G. Describe the result you want and I will help plan it, route it, or turn it into the next action inside this dashboard.',
    error: 'Request failed. Please try again.',
    ready: 'Streaming response ready.',
    quotaError: 'Agent G is temporarily unavailable because the AI quota has been reached.',
    rateLimitError: 'Agent G is busy right now. Try again in a moment.',
    authError: 'Agent G is unavailable until your session is refreshed.',
    unavailableError: 'Agent G is temporarily unavailable. Try again shortly.',
  },
  ka: {
    title: 'Agent G',
    subtitle: 'სტრიმინგ command ფანჯარა დაგეგმვისთვის, პრომპტინგისთვის და სერვისების სამართავად.',
    placeholder: 'სთხოვე Agent G-ს დაგეგმვა, მართვა ან შექმნა...',
    send: 'გაგზავნა',
    typing: 'Agent G პასუხობს...',
    welcome: 'გამარჯობა. მე ვარ Agent G. აღწერე სასურველი შედეგი და დაგეხმარები დაგეგმვაში, routing-ში და შემდეგ ნაბიჯში ამავე დეშბორდში.',
    error: 'მოთხოვნა ვერ შესრულდა. სცადე თავიდან.',
    ready: 'სტრიმინგ პასუხი მზად არის.',
    quotaError: 'Agent G დროებით მიუწვდომელია, რადგან AI კვოტა ამოიწურა.',
    rateLimitError: 'Agent G ამჟამად დაკავებულია. სცადე ცოტა მოგვიანებით.',
    authError: 'Agent G ხელმისაწვდომი არ არის, სანამ სესიას არ განაახლებ.',
    unavailableError: 'Agent G დროებით მიუწვდომელია. სცადე მალე ისევ.',
  },
  ru: {
    title: 'Agent G',
    subtitle: 'Потоковое окно управления для планирования, промптов и межсервисного выполнения.',
    placeholder: 'Попросите Agent G спланировать, направить или создать...',
    send: 'Отправить',
    typing: 'Agent G отвечает...',
    welcome: 'Здравствуйте. Я Agent G. Опишите нужный результат, и я помогу спланировать его, направить по сервисам и определить следующий шаг прямо в этом дашборде.',
    error: 'Запрос не выполнен. Попробуйте снова.',
    ready: 'Потоковый ответ готов.',
    quotaError: 'Agent G временно недоступен, потому что исчерпана AI-квота.',
    rateLimitError: 'Agent G сейчас занят. Повторите попытку чуть позже.',
    authError: 'Agent G недоступен, пока не будет обновлена ваша сессия.',
    unavailableError: 'Agent G временно недоступен. Повторите попытку позже.',
  },
} as const;

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (typeof payload?.error === 'string') {
      return payload.error;
    }
    if (typeof payload?.message === 'string') {
      return payload.message;
    }
  }

  return await response.text().catch(() => '');
}

function toFriendlyError(message: string, copy: (typeof COPY)[SupportedLocale]) {
  const normalized = message.toLowerCase();

  if (/quota|billing details|insufficient_quota/.test(normalized)) {
    return copy.quotaError;
  }
  if (/too many requests|rate limit|\b429\b/.test(normalized)) {
    return copy.rateLimitError;
  }
  if (/unauthorized|forbidden|\b401\b|\b403\b/.test(normalized)) {
    return copy.authError;
  }
  if (/service unavailable|temporarily unavailable|network|failed to fetch|\b500\b|\b503\b/.test(normalized)) {
    return copy.unavailableError;
  }

  return message || copy.error;
}

function buildPreview(title: string, detail: string, text: string): WorkspaceResult {
  return {
    kind: 'text',
    title,
    detail,
    text,
  };
}

export default function AgentGInterface({
  locale = 'en',
  callbacks,
  title,
  subtitle,
  placeholder,
  sendLabel,
  streamEndpoint = '/api/orbit/agent',
  initialMessages,
  allowAttachments = false,
  allowVoiceToggle = false,
  assistantBadge = 'G',
}: AgentGInterfaceProps) {
  const copy = COPY[locale] ?? COPY.en;
  const sessionId = useMemo(() => `agentg-${uuidv4()}`, []);
  const [messages, setMessages] = useState<Message[]>(
    initialMessages?.length
      ? initialMessages
      : [{ id: 'agent-g-welcome', role: 'assistant', content: copy.welcome }],
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
    };
    const assistantId = uuidv4();
    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    const jobId = callbacks?.onJobStart('agent-g', 'Agent G');

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setLoading(true);
    if (jobId) {
      callbacks?.onJobProgress(jobId, 8);
    }

    try {
      const response = await fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          locale,
          sessionId,
        }),
      });

      if (!response.ok || !response.body) {
        const responseError = await readErrorMessage(response);
        throw new Error(toFriendlyError(responseError, copy));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let progress = 12;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const line = event
            .split('\n')
            .find((entry) => entry.startsWith('data: '));

          if (!line) {
            continue;
          }

          const payloadText = line.replace(/^data:\s*/, '');
          const payload = JSON.parse(payloadText) as { token?: string; done?: boolean; error?: string };

          if (payload.error) {
            throw new Error(toFriendlyError(payload.error, copy));
          }

          if (payload.token) {
            fullText += payload.token;
            progress = Math.min(96, progress + 2);
            if (jobId) {
              callbacks?.onJobProgress(jobId, progress);
            }
            setMessages((current) => current.map((message) => (
              message.id === assistantId
                ? { ...message, content: fullText }
                : message
            )));
          }
        }
      }

      if (jobId) {
        callbacks?.onJobProgress(jobId, 100);
        callbacks?.onJobComplete(jobId, 'agent-g', copy.title, copy.ready, buildPreview(copy.title, copy.ready, fullText));
      }
    } catch (error) {
      const message = toFriendlyError(error instanceof Error ? error.message : copy.error, copy);
      setMessages((current) => current.map((item) => (
        item.id === assistantId
          ? { ...item, content: message }
          : item
      )));
      if (jobId) {
        callbacks?.onJobError(jobId, message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-xl text-white shadow-[0_0_24px_rgba(34,211,238,0.35)]">
            🤖
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">{title ?? copy.title}</h1>
            <p className="text-sm text-slate-400">{subtitle ?? copy.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex gap-3', message.role === 'user' && 'justify-end')}
            >
              {message.role === 'assistant' && (
                <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/10 text-sm text-cyan-100">
                  {assistantBadge}
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-[24px] border px-4 py-3 text-sm leading-7',
                  message.role === 'assistant'
                    ? 'border-white/10 bg-white/[0.05] text-slate-100'
                    : 'border-cyan-400/20 bg-cyan-400/12 text-cyan-50'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.typing}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={placeholder ?? copy.placeholder}
              rows={2}
              className="min-h-[56px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            />
            <div className="flex items-center gap-2 pb-1">
              {allowAttachments && (
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              )}
              {allowVoiceToggle && (
                <button
                  type="button"
                  onClick={() => setIsVoiceActive((current) => !current)}
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-slate-200 transition-colors',
                    isVoiceActive
                      ? 'border-fuchsia-400/30 bg-fuchsia-400/15 text-fuchsia-100'
                      : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.08]'
                  )}
                >
                  <Mic2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(34,211,238,0.28)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SendHorizonal className="h-4 w-4" />
                {sendLabel ?? copy.send}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}