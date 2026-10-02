'use client';

/**
 * MusicCreatePanel — the Music tool's Create screen, element for element as ref2:
 *
 *   title row  a Simple | Advanced switch · the engine pill (the real engine, or "Auto")
 *   "+ Audio | + Voice"
 *   LYRICS card   — wand · textarea · [library] [✓ Instrumental] [camera] … [expand]
 *   STYLES card   — wand · textarea · [library] ‹style chips› [expand]
 *   "More Options" — Vocal Gender (i) · Weirdness · Style Influence (i) · length · tempo · templates
 *   tiles (length · tempo) and the big "♪✦ Create" pill with the EXACT price on it.
 *
 * SIMPLE mode is the same screen minus everything but one prompt card and Create.
 *
 * This is a VIEW. OmniStudio owns the music state and the generation (`send` → `runMusicJob` → /api/ai/music); everything
 * arrives as props and every action leaves as a callback, so the composer's own Send and this button run the same code.
 * What is bound to what:
 *   · the Styles / Simple textarea IS the composer's text — `send()` reads it as the song's description;
 *   · the Lyrics textarea IS `musicLyrics`; Instrumental IS `musicInstrumental` (and keeps the lyrics box empty);
 *   · the chips are `musicStyles`, the dials are `musicVocal` · `musicSliders` · `musicDuration` · `musicTempo`;
 *   · "+ Audio / + Voice" ride the composer's attachments — the path runMusicJob already re-hosts and sends.
 *
 * REAL OR LOCKED, NEVER FAKED: the wands call the signed-in, rate-limited routes and say what happened (401 / 429 / busy);
 * the camera is locked "soon" (no vision-to-music-style helper exists) and carries no handler; the "+" halves lock when the
 * deployment has no provider for them; the engine pick is one the server honours and an engine it would refuse cannot be picked.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TemplateCardItem } from '@/components/studio/ui/TemplateGallery';
import { musicStyleLine, type VocalGender } from '@/lib/ai/musicControls';
import { effectiveEnginePref, enginePillLabel, type MusicEnginePref } from '@/lib/studio/musicEngines';
import { useMusicEnginePref } from '@/lib/studio/musicEnginePref';
import type { LibraryItem } from '@/lib/studio/musicLibrary';
import { isCoverRun, musicQuote, type MusicDuration } from '@/lib/studio/musicQuote';
import { useCreditsBalance } from '@/store/useCreditsBalance';
import { CreateBar } from './CreateBar';
import { ExpandEditor } from './ExpandEditor';
import { LibrarySheet } from './LibrarySheet';
import { MoreOptions } from './MoreOptions';
import { MusicRefs, type RefKind } from './MusicRefs';
import { MusicResult, type MusicTrack } from './MusicResult';
import { MusicTitleBar, type MusicUiMode } from './MusicTitleBar';
import { LyricsCard, SimpleCard, StylesCard, type CardNote } from './TextCards';
import { musicCreateCopy, type MusicTempo } from './musicCreateCopy';
import { enhanceStyleFor, writeLyricsFor, type WandFailure } from './musicWand';
import { useMusicEngines } from './useMusicEngines';

const UI_MODE_KEY = 'myavatar:music-ui-mode';
const LYRICS_MAX = 1200;
const STYLE_TEXT_MAX = 600;
/** How long a "+ Audio" / "+ Voice" tap is remembered while the file picker is open. */
const PICK_WINDOW_MS = 5 * 60_000;

export interface MusicCreatePanelProps {
  locale: string;
  /** ≥ 1024 px: the panel is the right column and the Result is the centre pane's job. */
  isDesktop: boolean;
  guest: boolean;

  /** The song's description — the composer's text. */
  styleText: string;
  onStyleText: (v: string) => void;
  lyrics: string;
  onLyrics: (v: string) => void;
  instrumental: boolean;
  onInstrumental: (v: boolean) => void;
  styles: string[];
  onStyles: (next: string[]) => void;
  styleOptions: ReadonlyArray<{ id: string; label: string }>;
  vocal: VocalGender;
  onVocal: (v: VocalGender) => void;
  sliders: { weirdness: number; styleInfluence: number };
  onSliders: (next: { weirdness: number; styleInfluence: number }) => void;
  duration: MusicDuration;
  onDuration: (d: MusicDuration) => void;
  tempo: MusicTempo;
  onTempo: (t: MusicTempo) => void;
  templates: { items: readonly TemplateCardItem[]; activeId: string | null; onPick: (id: string) => void };

  /** The attached audio (a cover source or a voice sample), or null. */
  audio: { name: string | null } | null;
  audioMode: RefKind;
  onAudioMode: (m: RefKind) => void;
  /** Opens the file picker (OmniStudio's hidden audio input — it validates type and size). */
  onPickAudio: () => void;
  onClearAudio: () => void;
  recording: { active: boolean; sec: number; start: () => void; stop: () => void };
  trainedVoice: { available: boolean; on: boolean; onChange: (v: boolean) => void };

  /** Create: `prompt` is what `send()` should treat as the description (the field's text, or the style line when empty). */
  onCreate: (prompt: string) => void;
  /** The latest track and its action row (built by OmniStudio) — shown at the foot of the phone sheet. */
  result: { track: MusicTrack | null; actions: ReactNode; label: string };
}

type ExpandTarget = 'lyrics' | 'styles' | 'simple' | null;
type LibraryTarget = 'lyrics' | 'styles' | null;

export function MusicCreatePanel(p: MusicCreatePanelProps) {
  const { locale } = p;
  const cc = musicCreateCopy(locale);

  // ── view state ────────────────────────────────────────────────────────────────────────────────────────
  const [uiMode, setUiModeState] = useState<MusicUiMode>('advanced');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(UI_MODE_KEY);
      if (v === 'simple' || v === 'advanced') setUiModeState(v);
    } catch { /* private mode — Advanced */ }
  }, []);
  const setUiMode = useCallback((m: MusicUiMode) => {
    setUiModeState(m);
    try { window.localStorage.setItem(UI_MODE_KEY, m); } catch { /* not persisted — still applied */ }
  }, []);
  const [lyricsOpen, setLyricsOpen] = useState(true);
  const [stylesOpen, setStylesOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(true);
  const [expand, setExpand] = useState<ExpandTarget>(null);
  const [library, setLibrary] = useState<LibraryTarget>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // ── what the server can run ────────────────────────────────────────────────────────────────────────
  const status = useMusicEngines();
  const [storedPref, setStoredPref] = useMusicEnginePref();
  const balance = useCreditsBalance((s) => s.balance);
  useEffect(() => { void useCreditsBalance.getState().get(); }, []);

  const trainedActive = p.trainedVoice.available && p.trainedVoice.on && !p.instrumental;
  // A trained voice sends no reference at all (the attached file is ignored), so only the other cases fix the engine.
  const reference: RefKind | null = p.audio && !trainedActive ? p.audioMode : null;
  const pref: MusicEnginePref = effectiveEnginePref(storedPref, status, { instrumental: p.instrumental });
  const firstEngine = pref !== 'auto' ? pref : status?.chain[0] ?? 'lyria';
  const controlsMode = status?.engines[firstEngine]?.controls ?? 'prompt';

  // ── the price: the shared quote at the seconds the route bills ────────────────────────────────────────
  const cover = isCoverRun({ hasAudio: !!p.audio, audioMode: p.audioMode, trainedVoiceActive: trainedActive });
  const price = musicQuote({ duration: p.duration, cover });
  const insufficient = !p.guest && balance !== null && balance < price;

  // ── Instrumental keeps the lyrics box empty (and gives the words back when it is turned off) ─────────
  const stash = useRef('');
  const latest = useRef({ lyrics: p.lyrics, onLyrics: p.onLyrics });
  latest.current = { lyrics: p.lyrics, onLyrics: p.onLyrics };
  const wasInstrumental = useRef(p.instrumental);
  useEffect(() => {
    const { lyrics, onLyrics } = latest.current;
    if (p.instrumental) {
      if (lyrics.trim()) { stash.current = lyrics; onLyrics(''); }
    } else if (wasInstrumental.current && stash.current && !lyrics.trim()) {
      onLyrics(stash.current);
      stash.current = '';
    }
    wasInstrumental.current = p.instrumental;
  }, [p.instrumental]);
  const changeLyrics = (v: string) => {
    // Typing words means a sung track: switch Instrumental off first (the stash is moot — these are new words).
    if (p.instrumental && v.trim()) { stash.current = ''; p.onInstrumental(false); }
    p.onLyrics(v.slice(0, LYRICS_MAX));
  };
  const toggleInstrumental = () => p.onInstrumental(!p.instrumental);

  // ── the audio pill: remember which half was tapped, apply it when the file arrives ────────────────────
  const wanted = useRef<{ kind: RefKind; at: number } | null>(null);
  const pick = (kind: RefKind) => {
    if (p.guest) { window.dispatchEvent(new CustomEvent('myavatar:auth-required')); return; }
    wanted.current = { kind, at: Date.now() };
    p.onPickAudio();
  };
  const { audio, onAudioMode } = p;
  useEffect(() => {
    const w = wanted.current;
    if (audio && w) {
      wanted.current = null;
      if (Date.now() - w.at < PICK_WINDOW_MS) onAudioMode(w.kind);
    }
  }, [audio, onAudioMode]);

  // ── the wands ───────────────────────────────────────────────────────────────────────────────────────────
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [lyricsNote, setLyricsNote] = useState<CardNote>(null);
  const [styleBusy, setStyleBusy] = useState(false);
  const [styleNote, setStyleNote] = useState<CardNote>(null);
  const alive = useRef(true);
  const aborter = useRef<AbortController | null>(null);
  useEffect(() => () => { alive.current = false; aborter.current?.abort(); }, []);

  const signIn = () => window.dispatchEvent(new CustomEvent('myavatar:auth-required'));
  const noteFor = (reason: WandFailure): CardNote => {
    if (reason === 'auth') return { tone: 'warn', text: cc.wandAuth, action: { label: cc.signIn, onClick: signIn } };
    return { tone: 'warn', text: reason === 'rate' ? cc.wandRate : reason === 'busy' ? cc.wandBusy : cc.wandFail };
  };

  const runLyricsWand = async () => {
    if (lyricsBusy) return;
    if (p.guest) { setLyricsNote(noteFor('auth')); return; }
    const style = musicStyleLine(p.styles);
    const theme = p.styleText.trim() || p.lyrics.trim() || style;
    aborter.current = new AbortController();
    setLyricsBusy(true);
    setLyricsNote(null);
    const r = await writeLyricsFor({ theme, locale, style, signal: aborter.current.signal });
    if (!alive.current) return;
    setLyricsBusy(false);
    if (r.ok) {
      if (p.instrumental) { stash.current = ''; p.onInstrumental(false); }
      p.onLyrics(r.text.slice(0, LYRICS_MAX));
    } else setLyricsNote(noteFor(r.reason));
  };

  const runStyleWand = async (setNote: (n: CardNote) => void) => {
    if (styleBusy) return;
    const text = p.styleText.trim();
    if (!text) { setNote({ tone: 'warn', text: cc.wandNeedWords }); return; }
    if (p.guest) { setNote(noteFor('auth')); return; }
    aborter.current = new AbortController();
    setStyleBusy(true);
    setNote(null);
    const r = await enhanceStyleFor({ text, signal: aborter.current.signal });
    if (!alive.current) return;
    setStyleBusy(false);
    if (r.ok) p.onStyleText(r.text.slice(0, STYLE_TEXT_MAX));
    else setNote(noteFor(r.reason));
  };

  // ── saved lists ────────────────────────────────────────────────────────────────────────────────────────
  const applySaved = (kind: 'lyrics' | 'styles', item: LibraryItem) => {
    if (kind === 'lyrics') {
      if (p.instrumental) { stash.current = ''; p.onInstrumental(false); }
      p.onLyrics(item.text.slice(0, LYRICS_MAX));
    } else {
      if (item.text) p.onStyleText(item.text.slice(0, STYLE_TEXT_MAX));
      if (item.chips?.length) p.onStyles(item.chips);
    }
  };
  const chipLabel = (id: string) => p.styleOptions.find((o) => o.id === id)?.label ?? id;

  // ── Create ─────────────────────────────────────────────────────────────────────────────────────────────
  const create = () => {
    if (insufficient) { window.dispatchEvent(new CustomEvent('myavatar:open-credits')); return; }
    // An empty description still creates: the style line is the brief (what send() always fell back to).
    p.onCreate(p.styleText.trim() || `${musicStyleLine(p.styles)} music`);
  };

  const showResult = !p.isDesktop && !!p.result.track;
  const simple = uiMode === 'simple';

  return (
    <div data-testid="music-panel" data-mode={uiMode} className="space-y-3 pb-1">
      <MusicTitleBar
        locale={locale}
        uiMode={uiMode}
        onUiMode={setUiMode}
        showEngine={!p.isDesktop}
        engine={{
          label: enginePillLabel({ locale, pref, reference }),
          status,
          pref,
          onPick: setStoredPref,
          instrumental: p.instrumental,
          reference,
        }}
      />

      <MusicRefs
        showPill={!simple}
        locale={locale}
        audio={p.audio}
        audioMode={p.audioMode}
        onAudioMode={p.onAudioMode}
        available={{ cover: status ? status.references.cover : null, voice: status ? status.references.voice : null }}
        onPick={pick}
        onClear={p.onClearAudio}
        recording={p.recording}
        trained={p.trainedVoice}
        instrumental={p.instrumental}
        voiceSheetOpen={voiceOpen}
        onVoiceSheet={setVoiceOpen}
      />

      {simple ? (
        <SimpleCard
          locale={locale}
          value={p.styleText}
          onChange={p.onStyleText}
          instrumental={p.instrumental}
          onInstrumental={toggleInstrumental}
          chips={p.styles}
          onChips={p.onStyles}
          chipOptions={p.styleOptions}
          wandBusy={styleBusy}
          onWand={() => void runStyleWand(setStyleNote)}
          note={styleNote}
          keptLyrics={p.lyrics.trim().length}
        />
      ) : (
        <>
          <LyricsCard
            locale={locale}
            open={lyricsOpen}
            onToggle={() => setLyricsOpen((v) => !v)}
            value={p.lyrics}
            onChange={changeLyrics}
            instrumental={p.instrumental}
            onInstrumental={toggleInstrumental}
            coverMode={cover}
            wandBusy={lyricsBusy}
            onWand={() => void runLyricsWand()}
            onLibrary={() => setLibrary('lyrics')}
            onExpand={() => setExpand('lyrics')}
            note={lyricsNote}
          />
          <StylesCard
            locale={locale}
            open={stylesOpen}
            onToggle={() => setStylesOpen((v) => !v)}
            value={p.styleText}
            onChange={p.onStyleText}
            chips={p.styles}
            onChips={p.onStyles}
            chipOptions={p.styleOptions}
            wandBusy={styleBusy}
            onWand={() => void runStyleWand(setStyleNote)}
            onLibrary={() => setLibrary('styles')}
            onExpand={() => setExpand('styles')}
            note={styleNote}
          />
          <MoreOptions
            locale={locale}
            open={moreOpen}
            onToggle={() => setMoreOpen((v) => !v)}
            instrumental={p.instrumental}
            vocal={p.vocal}
            onVocal={p.onVocal}
            sliders={p.sliders}
            onSliders={p.onSliders}
            controlsMode={controlsMode}
            duration={cover ? 30 : p.duration}
            onDuration={p.onDuration}
            lengthLocked={cover}
            tempo={p.tempo}
            onTempo={p.onTempo}
            templates={p.templates}
          />
        </>
      )}

      <CreateBar
        locale={locale}
        price={price}
        insufficient={insufficient}
        onCreate={create}
        duration={p.duration}
        onDuration={p.onDuration}
        cover={cover}
        tempo={p.tempo}
        onTempo={p.onTempo}
      />

      {showResult && <MusicResult testId="music-result-card" locale={locale} track={p.result.track} actions={p.result.actions} label={p.result.label} variant="card" />}

      {/* Overlays — each a real dialog (focus in, Tab trapped, Escape closes) */}
      <ExpandEditor
        open={expand === 'lyrics'}
        title={cc.expandLyrics}
        value={p.lyrics}
        onChange={changeLyrics}
        onClose={() => setExpand(null)}
        placeholder={p.instrumental ? cc.lyricsPlaceholderInstrumental : cc.lyricsPlaceholder}
        maxLength={LYRICS_MAX}
        doneLabel={cc.done}
      />
      <ExpandEditor
        open={expand === 'styles' || expand === 'simple'}
        title={cc.expandStyles}
        value={p.styleText}
        onChange={p.onStyleText}
        onClose={() => setExpand(null)}
        placeholder={simple ? cc.simplePlaceholder : cc.stylesPlaceholder}
        maxLength={STYLE_TEXT_MAX}
        doneLabel={cc.done}
      />
      <LibrarySheet
        open={library === 'lyrics'}
        kind="lyrics"
        locale={locale}
        currentText={p.lyrics}
        onClose={() => setLibrary(null)}
        onUse={(it) => applySaved('lyrics', it)}
      />
      <LibrarySheet
        open={library === 'styles'}
        kind="styles"
        locale={locale}
        currentText={p.styleText}
        currentChips={p.styles}
        chipLabel={chipLabel}
        onClose={() => setLibrary(null)}
        onUse={(it) => applySaved('styles', it)}
      />
    </div>
  );
}
