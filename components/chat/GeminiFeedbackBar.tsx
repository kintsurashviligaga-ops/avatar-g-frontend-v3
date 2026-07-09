'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, RotateCcw, Copy, Check, Share2 } from 'lucide-react';

interface Props {
  messageId: string;
  content: string;
  onRegenerate?: () => void;
  onFeedback?: (rating: 1 | -1) => void;
  accentColor?: string;
  locale?: string;
}

export function GeminiFeedbackBar({
  messageId,
  content,
  onRegenerate,
  onFeedback,
  accentColor = '#0ea5e9',
  locale = 'ka',
}: Props) {
  const [copied, setCopied] = useState(false);
  const [voted, setVoted] = useState<1 | -1 | null>(null);

  const labels =
    locale === 'ka'
      ? { copy: 'კოპია', share: 'გაზიარება', regen: 'განახლება', good: 'კარგია', bad: 'ცუდია' }
      : { copy: 'Copy', share: 'Share', regen: 'Regenerate', good: 'Good', bad: 'Bad' };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ text: content, title: 'MyAvatar AI Response' });
    } else {
      await handleCopy();
    }
  };

  const handleVote = (rating: 1 | -1) => {
    setVoted(rating);
    onFeedback?.(rating);
    fetch('/api/gemini/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, rating }),
    }).catch(() => {});
  };

  // accentColor used for future theming; suppress lint warning
  void accentColor;

  return (
    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => handleVote(1)}
        className={`p-1.5 rounded-lg transition-colors ${
          voted === 1
            ? 'text-green-400 bg-green-400/10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
        title={labels.good}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => handleVote(-1)}
        className={`p-1.5 rounded-lg transition-colors ${
          voted === -1
            ? 'text-red-400 bg-red-400/10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
        title={labels.bad}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          title={labels.regen}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        title={labels.copy}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      <button
        onClick={handleShare}
        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        title={labels.share}
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
