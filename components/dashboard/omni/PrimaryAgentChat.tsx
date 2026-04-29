'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Loader2, Send, TerminalSquare } from 'lucide-react';
import { useOmniDashboardStore } from './store';
import { OMNI_SERVICE_MAP } from './services';
import { formatClock } from './utils';

const QUICK_COMMANDS = [
  'Generate an image campaign pack and sync it to video references.',
  'Create executive summary plus storefront offer in one run.',
  'Build voiceover and soundtrack for the latest teaser.',
  'Assemble a workflow chain for launch day assets.',
];

export function PrimaryAgentChat() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const messages = useOmniDashboardStore((state) => state.chatMessages);
  const activeServiceId = useOmniDashboardStore((state) => state.activeServiceId);
  const sendPrimaryCommand = useOmniDashboardStore((state) => state.sendPrimaryCommand);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const runCommand = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await sendPrimaryCommand(trimmed);
      setPrompt('');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runCommand(prompt);
  };

  const activeService = OMNI_SERVICE_MAP[activeServiceId];

  return (
    <section className="omni-pane omni-chat-pane flex min-h-0 flex-col rounded-2xl border p-3 sm:p-4">
      <header className="mb-3 flex items-center gap-3 border-b border-white/10 pb-3">
        <div className="omni-led is-online" />
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-cyan-200" />
          <p className="omni-title text-sm font-semibold text-white">Primary Agent Console</p>
        </div>
        <div className="ml-auto rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium text-cyan-100/85">
          Context: {activeService.title}
        </div>
      </header>

      <div ref={containerRef} className="omni-chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/10 p-3">
        {messages.map((message) => (
          <motion.article
            key={message.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={message.role === 'assistant' ? 'omni-chat-line is-assistant' : 'omni-chat-line is-user'}
          >
            <div className="flex items-start gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-cyan-200/70">
                {message.role === 'assistant' ? 'agent' : 'operator'}
              </span>
              <p className="flex-1 text-sm leading-relaxed text-white/88">{message.content}</p>
            </div>
            <p className="mt-1 text-right font-mono text-[10px] text-white/35">{formatClock(message.ts)}</p>
          </motion.article>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {QUICK_COMMANDS.map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-white/72 transition-colors hover:bg-white/[0.08]"
            onClick={() => void runCommand(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2.5">
        <label className="mb-2 flex items-center gap-2 text-[11px] font-mono text-cyan-100/65">
          <TerminalSquare className="h-3.5 w-3.5" />
          @agent-g:~$
        </label>
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the objective and dependencies..."
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="omni-button h-10 min-w-[90px] rounded-lg px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <Send className="mx-auto h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}
