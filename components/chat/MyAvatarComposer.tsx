'use client';

/**
 * MyAvatarComposer — the MyAvatarChat input dock (Roadmap #12 / Phase 1.2).
 *
 * A thin surface variant built on the shared <BaseChatComposer/> primitive: it
 * supplies the MyAvatar-specific chrome (drag-drop image zone, attachment chip,
 * attach/camera/mic controls, send/stop) via the primitive's overlay/header/
 * leftActions/rightActions slots. All state, refs, autosize, dictation and submit
 * logic stay in the MyAvatarChat container and arrive as props.
 */

import type React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon, X, Paperclip, Camera, Mic, Send } from 'lucide-react';
import type { Locale } from '@/components/chat/types';
import { BaseChatComposer } from '@/components/chat/BaseChatComposer';

// Live "listening" indicator next to the mic button.
function SoundwaveMeter() {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  const peaks = [10, 20, 13, 24, 11, 18, 9];
  const durs = [0.74, 0.96, 0.62, 1.02, 0.82, 0.7, 0.66];
  return (
    <motion.div
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-[3px] h-6 px-1.5 overflow-hidden"
      aria-hidden="true"
    >
      {bars.map(i => {
        const peak = peaks[i] ?? 12;
        return (
          <motion.span
            key={i}
            className="w-[2.5px] rounded-full bg-gradient-to-t from-blue-500 via-sky-400 to-cyan-300"
            initial={{ height: 4 }}
            animate={{ height: [4, peak, 7, peak - 5, 4] }}
            transition={{ duration: durs[i] ?? 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09 }}
          />
        );
      })}
    </motion.div>
  );
}

export interface MyAvatarComposerProps {
  locale: Locale;
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChosen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPickFile: () => void;
  onOpenCamera: () => void;
  attachment: { previewUrl: string; name: string } | null;
  onClearAttachment: () => void;
  dragActive: boolean;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  listening: boolean;
  onToggleVoice: () => void;
}

export function MyAvatarComposer({
  locale, input, onInputChange, onKeyDown, onSend, onStop, sending,
  inputRef, fileInputRef, onFileChosen, onPickFile, onOpenCamera,
  attachment, onClearAttachment, dragActive, onDrop, onDragOver, onDragLeave,
  listening, onToggleVoice,
}: MyAvatarComposerProps) {
  const overlay = dragActive ? (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-none">
      <span className="inline-flex items-center gap-2 text-[13px] font-medium text-cyan-200">
        <ImageIcon size={16} />
        {locale === 'ka' ? 'ჩააგდე სურათი აქ' : locale === 'ru' ? 'Перетащите изображение' : 'Drop image here'}
      </span>
    </div>
  ) : null;

  const header = (
    <>
      <AnimatePresence initial={false}>
        {attachment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pt-3 -mb-1">
              <div className="inline-flex items-center gap-2 max-w-full pl-1 pr-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.10] text-[11px] text-white/85">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.previewUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                <span className="truncate max-w-[180px]">{attachment.name}</span>
                <button
                  type="button"
                  onClick={onClearAttachment}
                  aria-label="Remove attachment"
                  className="h-5 w-5 rounded-full hover:bg-white/[0.10] flex items-center justify-center text-white/65 hover:text-white transition"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChosen} />
    </>
  );

  const leftActions = (
    <>
      <button
        type="button"
        aria-label="Attach image"
        onClick={onPickFile}
        title={locale === 'ka' ? 'სურათის მიმაგრება (ავატარისთვის)' : 'Attach image (for Avatar)'}
        className="h-9 w-9 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-[#94A3B8] hover:text-white transition active:scale-90"
      >
        <Paperclip size={16} />
      </button>
      <button
        type="button"
        aria-label="Camera"
        onClick={onOpenCamera}
        title={locale === 'ka' ? 'კამერა' : 'Camera'}
        className="h-9 w-9 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-[#94A3B8] hover:text-white transition active:scale-90"
      >
        <Camera size={16} />
      </button>
    </>
  );

  const rightActions = (
    <>
      <AnimatePresence>{listening && <SoundwaveMeter />}</AnimatePresence>
      <button
        type="button"
        aria-label={listening ? 'Stop listening' : 'Voice input'}
        onClick={onToggleVoice}
        className={`h-9 w-9 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out active:scale-90 ${
          listening
            ? 'bg-gradient-to-br from-cyan-400 to-blue-600 text-white ring-1 ring-sky-300/50 shadow-[0_0_18px_-4px_rgba(56,189,248,0.7)] animate-pulse'
            : 'hover:bg-white/[0.06] text-[#94A3B8] hover:text-white'
        }`}
      >
        <Mic size={16} />
      </button>
      {sending ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] bg-rose-500/90 hover:bg-rose-500 text-white transition"
        >
          <span className="block h-2.5 w-2.5 bg-white rounded-[2px]" />
          {locale === 'ka' ? 'შეჩერება' : 'Stop'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim()}
          className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] transition-all duration-300 ease-in-out ${
            input.trim()
              ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white hover:from-cyan-300 hover:to-blue-500 shadow-[0_6px_22px_-8px_rgba(56,189,248,0.7)]'
              : 'bg-black border border-white/[0.10] text-white/35 cursor-not-allowed'
          }`}
        >
          <Send size={14} />
          {locale === 'ka' ? 'გაგზავნა' : 'Send'}
        </button>
      )}
    </>
  );

  return (
    <BaseChatComposer
      value={input}
      onChange={onInputChange}
      onKeyDown={onKeyDown}
      textareaRef={inputRef}
      placeholder={locale === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
      minHeight={56}
      maxHeight={168}
      wrapperClassName={`relative rounded-3xl bg-black border overflow-hidden transition flex-shrink-0 ${
        dragActive ? 'border-sky-400/60 ring-2 ring-sky-500/30' : 'border-white/[0.10] focus-within:border-white/[0.22]'
      }`}
      overlay={overlay}
      header={header}
      leftActions={leftActions}
      rightActions={rightActions}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    />
  );
}
