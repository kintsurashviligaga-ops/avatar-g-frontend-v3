/**
 * components/chat/artifacts/artifactStore.ts — the canvas's state: open/closed, the artifact on screen, its versions.
 *
 * A zustand store (like `store/useStudioBridge`), because its writers are far from its one reader: a `CodeBlock`
 * deep inside a memoized markdown block, and the `myavatar:open-artifact` listener, both open what `ArtifactCanvas`
 * shows. Nothing here renders.
 *
 *   open          the canvas is showing
 *   current       the artifact on screen ({id, title, language, code}) — one specific VERSION of `current.id`
 *   versionIndex  which version of `current.id` that is
 *   versions      every artifact id → its versions, oldest first
 *   tab           'code' | 'preview' (preview only exists for html / svg)
 *   hosts         how many canvases are mounted; a code block offers "Open in canvas" only when one is
 *
 * ⚠️ OPENING THE SAME CODE TWICE IS NOT A NEW VERSION. Clicking an older reply's block re-selects the version it
 * already is (so the switcher stays honest: v1 is what v1 was), and the voice tool re-sending an unchanged page does
 * nothing but bring the canvas back.
 *
 * ⚠️ BOUNDED. At most MAX_VERSIONS per artifact and MAX_ARTIFACTS ids (least recently opened evicted, never the one
 * on screen). Each version is up to 200 KB, so an unbounded store in a long session is a memory leak by design.
 */

import { create } from 'zustand';
import { isPreviewable, toArtifactInput, type ArtifactInput } from './artifactSpec';

export type Artifact = ArtifactInput;
export type ArtifactTab = 'code' | 'preview';

export const MAX_VERSIONS = 10;
export const MAX_ARTIFACTS = 20;

export interface OpenArtifactOptions {
  /** Which tab to land on. Defaults to Preview for html / svg, Code otherwise; Preview is ignored for the rest. */
  tab?: ArtifactTab;
}

export interface ArtifactState {
  open: boolean;
  current: Artifact | null;
  versionIndex: number;
  versions: Record<string, Artifact[]>;
  /** Artifact ids, least recently opened first. */
  order: string[];
  tab: ArtifactTab;
  hosts: number;

  /**
   * Validates (`toArtifactInput`), files the code as the newest version of its id unless that exact code is already
   * a version, and shows it. Returns what is on screen, or null when the input was refused (nothing changes then).
   */
  openArtifact: (input: { id?: unknown; title?: unknown; language?: unknown; code?: unknown }, options?: OpenArtifactOptions) => Artifact | null;
  close: () => void;
  /** Shows version `index` of the current artifact (clamped). */
  selectVersion: (index: number) => void;
  setTab: (tab: ArtifactTab) => void;
  /** A mounted canvas registers itself; the returned function unregisters it. */
  registerHost: () => () => void;
}

const ID_RE = /^[\p{L}\p{N} _:.#+-]{1,200}$/u;

function initialData(): Pick<ArtifactState, 'open' | 'current' | 'versionIndex' | 'versions' | 'order' | 'tab' | 'hosts'> {
  return { open: false, current: null, versionIndex: 0, versions: {}, order: [], tab: 'code', hosts: 0 };
}

function landingTab(artifact: Artifact, wanted: ArtifactTab | undefined): ArtifactTab {
  if (!isPreviewable(artifact.language)) return 'code';
  return wanted ?? 'preview';
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  ...initialData(),

  openArtifact: (raw, options) => {
    const valid = toArtifactInput(raw ?? {});
    if (!valid) return null;
    // A producer may name its own id (a Live tool editing "its" page); otherwise language + title decide.
    const id = typeof raw.id === 'string' && ID_RE.test(raw.id.trim()) ? raw.id.trim() : valid.id;
    const artifact: Artifact = { ...valid, id };

    const state = get();
    const prior = state.versions[id] ?? [];
    const existing = prior.findIndex((v) => v.code === artifact.code && v.language === artifact.language);
    let list = prior;
    let index = existing;
    if (existing === -1) {
      list = [...prior, artifact].slice(-MAX_VERSIONS);
      index = list.length - 1;
    }

    const versions: Record<string, Artifact[]> = { ...state.versions, [id]: list };
    let order = [...state.order.filter((x) => x !== id), id];
    while (order.length > MAX_ARTIFACTS) {
      const evict = order[0]!;
      order = order.slice(1);
      delete versions[evict];
    }

    const shown = list[index]!;
    set({ open: true, current: shown, versionIndex: index, versions, order, tab: landingTab(shown, options?.tab) });
    return shown;
  },

  close: () => set({ open: false }),

  selectVersion: (index) => {
    const { current, versions, tab } = get();
    if (!current) return;
    const list = versions[current.id] ?? [];
    if (list.length === 0) return;
    const i = Math.max(0, Math.min(list.length - 1, Math.trunc(Number.isFinite(index) ? index : 0)));
    const shown = list[i]!;
    set({ current: shown, versionIndex: i, tab: isPreviewable(shown.language) ? tab : 'code' });
  },

  setTab: (tab) => {
    const { current } = get();
    if (tab === 'preview' && (!current || !isPreviewable(current.language))) return;
    set({ tab });
  },

  registerHost: () => {
    set((s) => ({ hosts: s.hosts + 1 }));
    let done = false;
    return () => {
      if (done) return; // StrictMode / a double cleanup must not drive the count below the real number of hosts
      done = true;
      set((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
    };
  },
}));

const NO_VERSIONS: readonly Artifact[] = Object.freeze([]);

/**
 * Versions of the artifact on screen (empty when none). ⚠️ The empty case returns ONE frozen array: a selector that
 * returns a fresh `[]` makes zustand's useSyncExternalStore see a new snapshot on every read and re-render forever.
 */
export function selectCurrentVersions(s: ArtifactState): readonly Artifact[] {
  return (s.current && s.versions[s.current.id]) || NO_VERSIONS;
}

/** Tests only: back to a fresh, closed, host-less store. */
export function resetArtifactStore(): void {
  useArtifactStore.setState(initialData());
}
