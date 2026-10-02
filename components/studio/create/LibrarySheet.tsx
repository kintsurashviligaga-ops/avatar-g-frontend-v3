'use client';

/**
 * LibrarySheet — the [library] buttons' saved lists (lib/studio/musicLibrary): lyrics under Lyrics, a style description plus
 * its chips under Styles. Save what is in the card now, insert a saved entry, delete one. Device-local and per user.
 *
 * Every outcome is said in words (saved · already saved · nothing to save · could not save), because "the button did
 * nothing" is the failure a silent localStorage miss would otherwise be.
 */
import { useEffect, useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import { readLibrary, removeFromLibrary, saveToLibrary, type LibraryItem, type LibraryKind } from '@/lib/studio/musicLibrary';
import { musicCreateCopy } from './musicCreateCopy';

export function LibrarySheet({
  open, onClose, kind, locale, currentText, currentChips, chipLabel, onUse,
}: {
  open: boolean;
  onClose: () => void;
  kind: LibraryKind;
  locale: string;
  currentText: string;
  /** Styles only: the chips picked now (saved along with the description). */
  currentChips?: readonly string[];
  /** Styles only: a chip's display name. */
  chipLabel?: (id: string) => string;
  onUse: (item: LibraryItem) => void;
}) {
  const cc = musicCreateCopy(locale);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(readLibrary(kind));
    setMsg(null);
  }, [open, kind]);

  const save = () => {
    const r = saveToLibrary(kind, { text: currentText, chips: currentChips });
    if (!r.ok) {
      setMsg({ tone: 'warn', text: r.reason === 'empty' ? cc.libNothingToSave : cc.wandFail });
      return;
    }
    setItems(r.items);
    setMsg({ tone: 'info', text: cc.libSaved });
  };

  const remove = (id: string) => setItems(removeFromLibrary(kind, id));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={kind === 'lyrics' ? cc.libLyricsTitle : cc.libStylesTitle}
      closeLabel={cc.close}
      testId={`music-library-${kind}`}
    >
      <div className="space-y-2 px-2 pb-3 pt-1">
        <button
          type="button"
          data-testid="music-library-save"
          onClick={save}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-app-accent px-4 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/80"
        >
          <BookmarkPlus size={17} aria-hidden="true" />
          {cc.libSave}
        </button>
        {msg && (
          <p data-testid="music-library-msg" role={msg.tone === 'warn' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-[12.5px] ${msg.tone === 'warn' ? 'bg-app-warning/10 text-app-warning' : 'bg-app-accent/10 text-app-accent'}`}>
            {msg.text}
          </p>
        )}
        {items.length === 0 ? (
          <p data-testid="music-library-empty" className="px-1 py-3 text-[13px] leading-snug text-app-muted">{cc.libEmpty}</p>
        ) : (
          <ul data-testid="music-library-list" className="space-y-1.5">
            {items.map((it) => (
              <li key={it.id} data-testid="music-library-item" className="flex min-w-0 items-center gap-1.5 rounded-2xl bg-app-elevated/50 py-1 pl-3 pr-1 ring-1 ring-app-border/10">
                <div className="min-w-0 flex-1 py-1">
                  {it.text && <p className="line-clamp-2 whitespace-pre-line break-words text-[13px] leading-snug text-app-text">{it.text}</p>}
                  {it.chips && it.chips.length > 0 && (
                    <p className="mt-0.5 truncate text-[11.5px] text-app-muted">{it.chips.map((c) => chipLabel?.(c) ?? c).join(' · ')}</p>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="music-library-use"
                  onClick={() => { onUse(it); onClose(); }}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-app-accent/15 px-4 text-[13px] font-semibold text-app-accent ring-1 ring-app-accent/35 transition-colors hover:bg-app-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70"
                >
                  {cc.libUse}
                </button>
                <button
                  type="button"
                  data-testid="music-library-delete"
                  onClick={() => remove(it.id)}
                  aria-label={cc.libDelete}
                  title={cc.libDelete}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
