/**
 * lib/video/directorsWorkflow/scenePrompt.ts — one scene card → the prompt its clip is rendered with.
 *
 * Built ON the single-clip prompt (lib/video/clipPrompt.composeClipPrompt), so every rule learned there holds for every
 * scene: each person says only their own words once in their own voice, the camera is on whoever speaks, no narrator, no
 * false starts, one continuous shot, no subtitles, no music unless asked. What a scene card adds:
 *   • the LOOK of each character on screen, word for word in every scene they are in (the same person across cuts);
 *   • the camera note;
 *   • the scene's own sound — ambience, effects and an optional music cue — as one „Sound design:" line, which is what
 *     Omni follows (a bare negative was ignored: GG's clips 2026-10-26).
 *
 * The action and the looks are the user's words. The engines read English best, so the server translates them (the
 * reader in lib/video/clipSpeech) and passes the English in; the spoken lines are NEVER translated.
 *
 * Pure and client-safe.
 */
import { composeClipPrompt, type ClipReading } from '@/lib/video/clipPrompt';
import { sceneClipSpec, sceneSpeakers } from './plan';
import type { DwProject, DwScene } from './types';

/** The English the server's reader produced for one scene. Defaults to the user's own words (tests, English input). */
export interface DwSceneEnglish {
  action?: string;
  camera?: string;
  /** characterId → English look. */
  looks?: Record<string, string>;
  ambience?: string;
  effects?: string[];
  music?: string | null;
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const sentence = (s: string): string => (s ? `${s.replace(/[.!?…]+$/, '')}.` : '');

/** The „Sound design:" line, or null when the card says nothing about sound (composeClipPrompt's default applies). */
export function soundDesignLine(ambience: string, effects: readonly string[], music: string | null, hasLines: boolean): string | null {
  const heard: string[] = [];
  if (hasLines) heard.push('the spoken lines');
  if (ambience) heard.push(ambience);
  for (const e of effects) if (e) heard.push(e);
  if (!ambience && effects.length === 0 && !music) return null;
  return `Sound design: ${heard.join(', ')}${music ? `, with music: ${music}` : '. No music'}.`;
}

export function composeScenePrompt(project: DwProject, scene: DwScene, english: DwSceneEnglish = {}): string {
  const spec = sceneClipSpec(project, scene);
  const lines = scene.audio.lines.filter((l) => l.text.trim());
  const action = clean(english.action ?? scene.action);
  const camera = clean(english.camera ?? scene.camera);
  const ambience = clean(english.ambience ?? scene.audio.ambience);
  const effects = (english.effects ?? scene.audio.effects).map(clean).filter(Boolean);
  const music = english.music !== undefined ? english.music : scene.audio.music;

  const cast = scene.characterIds
    .map((id) => project.characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => `${c.name}: ${clean(english.looks?.[c.id] ?? c.look)}`);

  // Lines go in as [LINE n] markers after the action so composeClipPrompt places each once, in order.
  const said = lines.map((l, i) => {
    const who = project.characters.find((c) => c.id === l.characterId)?.name ?? 'Someone';
    return `${who} says [LINE ${i + 1}]`;
  });
  const englishBody = [
    cast.length ? `On screen: ${cast.join('; ')}.` : '',
    sentence(action),
    camera ? `Camera: ${sentence(camera)}` : '',
    said.length ? `${said.join(', then ')}.` : '',
  ].filter(Boolean).join(' ');

  const speakers = sceneSpeakers(project, scene);
  const reading: ClipReading = {
    english: englishBody,
    lines: lines.map((l) => clean(l.text)),
    speakers,
    speaker: speakers[0]?.voice ?? null,
    silent: lines.length === 0,
  };
  const photos = spec.photos > 0 ? 'frame' : 'none';
  const sound = soundDesignLine(ambience, effects, music, lines.length > 0);
  // With our own sound line the base rule's „No music, just room tone" would contradict an asked-for cue or ambience.
  const base = composeClipPrompt({ reading, photos, engine: spec.engine, music: sound !== null });
  return sound ? `${base} ${sound}` : base;
}
