/**
 * Copy Button Component
 * 
 * Button that copies text to clipboard and shows toast
 */

'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CopyButtonProps {
  text: string;
  label: string;
  successMessage?: string;
  className?: string;
}

export function CopyButton({
  text,
  label,
  successMessage = 'Copied!',
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
      <Button
        onClick={handleCopy}
        variant="outline"
        size="sm"
        className={`${className} ${
          copied
            ? 'bg-green-500/20 border-green-500/30 text-green-400'
            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
        }`}
        disabled={copied}
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 mr-1.5" />
            {successMessage}
          </>
        ) : (
          <>
            <Copy className="w-3 h-3 mr-1.5" />
            {label}
          </>
        )}
      </Button>
    </>
  );
}
