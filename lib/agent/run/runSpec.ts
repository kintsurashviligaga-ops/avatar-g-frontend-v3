/**
 * lib/agent/run/runSpec.ts — what a multi-step Agent G run is made of (PART 2, gap T1), checked before anything runs.
 *
 * A run is an ordered list of STEPS. Each step is one of the typed media actions that already run on the lease queue
 * (an audio extraction, a montage), and a step's input may be an earlier step's result: „take the sound out of this
 * video, then cut these clips to it" is
 *
 *   [{ id: 'sound', tool: 'audio_extract', source: { file: <video> } },
 *    { id: 'clip',  tool: 'montage', files: [<clip 1>, <clip 2>, { step: 'sound' }] }]
 *
 * A reference may only name an EARLIER step, so a run is a dependency graph without cycles by construction, and the
 * order the user saw is an order it can run in. Pure and isomorphic (the chat builds specs with it).
 */
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import type { CapabilityId } from '../contracts';

/** At most this many steps in one run (the card must stay readable; the sweep must finish a tick quickly). */
export const MAX_RUN_STEPS = 6;
/** At most this many files in one montage step (lib/agent/media/montageAsk MAX_FILES). */
export const MAX_MONTAGE_FILES = 13;
const MAX_REF = 2048;
const MAX_TITLE = 120;
const MAX_PROMPT = 2000;
const STEP_ID = /^[a-z][a-z0-9-]{0,23}$/;

/** A file the user sent (a storage path or our signed link), or the result of an earlier step. */
export type FileRef = string | { step: string };

export type RunStepSpec =
  | { id: string; tool: 'audio_extract'; source: { url: string } | { file: FileRef }; name?: string }
  | {
    id: string; tool: 'montage'; files: FileRef[]; prompt?: string; aspect?: '9:16' | '16:9' | '1:1'; targetSec?: number; musicFromSec?: number;
  };

export type RunTool = RunStepSpec['tool'];

export interface RunSpec {
  /** The user's own words for the whole run (the card's title). */
  title?: string;
  steps: RunStepSpec[];
}

/** The capability each tool is (lib/agent/capabilities). */
export const TOOL_CAPABILITY: Readonly<Record<RunTool, CapabilityId>> = {
  audio_extract: 'agent.audio-extract',
  montage: 'agent.montage',
};

export type SpecError = { ok: false; error: 'bad_spec'; message: string; step?: string };

const fail = (message: string, step?: string): SpecError => ({ ok: false, error: 'bad_spec', message, ...(step ? { step } : {}) });
const plainObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number): string | null => (typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : null);
const positive = (x: unknown, max: number): number | undefined =>
  (typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= max ? x : undefined);

/** The steps a step's input names, in order. */
export function refsOf(step: RunStepSpec): string[] {
  const out: string[] = [];
  const add = (r: FileRef) => { if (typeof r !== 'string') out.push(r.step); };
  if (step.tool === 'montage') step.files.forEach(add);
  else if ('file' in step.source) add(step.source.file);
  return out;
}

function fileRef(x: unknown, earlier: ReadonlySet<string>): FileRef | null {
  if (typeof x === 'string') return text(x, MAX_REF);
  if (plainObject(x) && Object.keys(x).length === 1 && typeof x.step === 'string' && earlier.has(x.step)) return { step: x.step };
  return null;
}

/**
 * Check a run spec field by field and rebuild it from what was checked (nothing unchecked is carried). A reference to a
 * step that is not earlier in the list, an unknown tool or field shape, too many steps or files: refused, by name.
 */
export function validateRunSpec(x: unknown): { ok: true; spec: RunSpec } | SpecError {
  if (!plainObject(x) || !Array.isArray(x.steps)) return fail('A run is a list of steps.');
  if (!x.steps.length) return fail('A run needs at least one step.');
  if (x.steps.length > MAX_RUN_STEPS) return fail(`At most ${MAX_RUN_STEPS} steps in one run.`);
  if (x.title !== undefined && !text(x.title, MAX_TITLE)) return fail('The title is not valid.');
  const seen = new Set<string>();
  const steps: RunStepSpec[] = [];
  for (const raw of x.steps as unknown[]) {
    if (!plainObject(raw) || typeof raw.id !== 'string' || !STEP_ID.test(raw.id)) return fail('Every step needs a short id (a-z, 0-9, -).');
    const id = raw.id;
    if (seen.has(id)) return fail(`Two steps are called "${id}".`, id);
    if (raw.tool === 'audio_extract') {
      const src = raw.source;
      if (!plainObject(src) || Object.keys(src).length !== 1) return fail('Give the extraction one source: a link or a file.', id);
      let source: { url: string } | { file: FileRef };
      if ('url' in src) {
        const url = text(src.url, MAX_REF);
        if (!url || !/^https?:\/\//i.test(url)) return fail('The link is not valid.', id);
        source = { url };
      } else if ('file' in src) {
        const file = fileRef(src.file, seen);
        if (!file) return fail('The file is not valid, or names a step that does not come before this one.', id);
        source = { file };
      } else {
        return fail('Give the extraction one source: a link or a file.', id);
      }
      if (raw.name !== undefined && !text(raw.name, 100)) return fail('The name is not valid.', id);
      steps.push({ id, tool: 'audio_extract', source, ...(typeof raw.name === 'string' ? { name: raw.name.trim() } : {}) });
    } else if (raw.tool === 'montage') {
      if (!Array.isArray(raw.files) || raw.files.length < 2 || raw.files.length > MAX_MONTAGE_FILES) {
        return fail(`A montage takes 2 to ${MAX_MONTAGE_FILES} files: the clips and one track.`, id);
      }
      const files: FileRef[] = [];
      for (const f of raw.files as unknown[]) {
        const ref = fileRef(f, seen);
        if (!ref) return fail('A file is not valid, or names a step that does not come before this one.', id);
        files.push(ref);
      }
      if (raw.prompt !== undefined && (typeof raw.prompt !== 'string' || raw.prompt.length > MAX_PROMPT)) return fail('The words are too long.', id);
      if (raw.aspect !== undefined && raw.aspect !== '9:16' && raw.aspect !== '16:9' && raw.aspect !== '1:1') return fail('The frame is not valid.', id);
      const targetSec = positive(raw.targetSec, 600);
      const musicFromSec = positive(raw.musicFromSec, 3600);
      if (raw.targetSec !== undefined && targetSec === undefined) return fail('The length is not valid.', id);
      if (raw.musicFromSec !== undefined && musicFromSec === undefined) return fail('The music start is not valid.', id);
      steps.push({
        id, tool: 'montage', files,
        ...(typeof raw.prompt === 'string' && raw.prompt.trim() ? { prompt: raw.prompt.trim() } : {}),
        ...(raw.aspect ? { aspect: raw.aspect as '9:16' | '16:9' | '1:1' } : {}),
        ...(targetSec ? { targetSec } : {}),
        ...(musicFromSec ? { musicFromSec } : {}),
      });
    } else {
      return fail('This step names a tool a run cannot use.', id);
    }
    seen.add(id);
  }
  return { ok: true, spec: { ...(typeof x.title === 'string' ? { title: x.title.trim() } : {}), steps } };
}

/** What a plan token is bound to. Prefixed, so no single job's quote fingerprint can ever stand for a run's. */
export const specFingerprint = (spec: RunSpec): string => `run:${bodyFingerprint(spec)}`;
