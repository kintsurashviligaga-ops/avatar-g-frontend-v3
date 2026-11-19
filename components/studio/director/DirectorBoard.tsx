'use client';
/**
 * DirectorBoard — the Director's Workflow storyboard (Phase 8.2): an idea → 1–10 scene cards the user edits, each with
 * its own lines, sound, length, engine and price, and one approval for the whole film.
 *
 * Shown only when GET /api/video/director-workflow says the feature is open to this user (DIRECTORS_WORKFLOW). Planning
 * is free (GG 2026-11-14): POST /api/video/director-workflow/plan returns a draft board; every edit after that is local
 * and free. The price under the cards is computed here from the same pure quote the server checks again before any
 * charge (lib/video/directorsWorkflow/plan.quoteProject). Rendering is `onApprove`'s job (Phase 8.3).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DW_MAX_CHARACTERS,
  DW_MAX_LINES_PER_SCENE,
  DW_MAX_SCENES,
  addScene,
  duplicateScene,
  moveScene,
  newId,
  quoteProject,
  removeScene,
  updateScene,
  validateProject,
  type DwCharacter,
  type DwProblem,
  type DwProject,
  type DwQuote,
  type DwScene,
} from '@/lib/video/directorsWorkflow';
import { DIRECT_CLIP_SECONDS, type DirectClipAspect, type DirectClipResolution, type DirectClipSeconds } from '@/lib/video/directClip';

type Lang = string;
const tr = (locale: Lang, ka: string, en: string, ru: string): string => (locale === 'en' ? en : locale === 'ru' ? ru : ka);

export function useDirectorsWorkflowEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/video/director-workflow', { credentials: 'include', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => setEnabled(Boolean(j && typeof j === 'object' && (j as { enabled?: unknown }).enabled === true)))
      .catch(() => { /* offline / aborted → feature hidden */ });
    return () => ac.abort();
  }, []);
  return enabled;
}

/** The card's own words for each problem code (validateProject's `detail` is for logs). */
export function problemText(locale: Lang, p: DwProblem): string {
  switch (p.code) {
    case 'scene_count': return tr(locale, `სცენები: 1-დან ${DW_MAX_SCENES}-მდე.`, `Scenes: 1 to ${DW_MAX_SCENES}.`, `Сцен: от 1 до ${DW_MAX_SCENES}.`);
    case 'character_count': return tr(locale, `მაქსიმუმ ${DW_MAX_CHARACTERS} პერსონაჟი.`, `At most ${DW_MAX_CHARACTERS} characters.`, `Не больше ${DW_MAX_CHARACTERS} персонажей.`);
    case 'action': return tr(locale, 'დაწერე, რა ხდება სცენაში.', 'Write what happens in the scene.', 'Опишите, что происходит в сцене.');
    case 'speaker_not_in_scene': return tr(locale, 'ვინც ლაპარაკობს, კადრშიც უნდა იყოს.', 'Whoever speaks must be on screen.', 'Говорящий должен быть в кадре.');
    case 'unknown_character': return tr(locale, 'ეს პერსონაჟი აღარ არსებობს.', 'This character no longer exists.', 'Этого персонажа больше нет.');
    case 'too_many_lines': return tr(locale, `მაქსიმუმ ${DW_MAX_LINES_PER_SCENE} ფრაზა სცენაში.`, `At most ${DW_MAX_LINES_PER_SCENE} lines per scene.`, `Не больше ${DW_MAX_LINES_PER_SCENE} реплик в сцене.`);
    case 'speech_too_long': return tr(locale, 'ტექსტი ამ ხანგრძლივობაში ვერ ეტევა: შეამოკლე ან აირჩიე გრძელი სცენა.', 'The lines do not fit this length: shorten them or pick a longer scene.', 'Текст не помещается: сократите его или выберите сцену длиннее.');
    case 'first_frame': return tr(locale, 'პირველი კადრი: პირველი სცენა წინა სცენიდან ვერ გაგრძელდება, ფოტოს ვარიანტს ფოტო სჭირდება.', 'First frame: scene 1 cannot continue a previous scene; "photo" needs a photo.', 'Первый кадр: сцена 1 не может продолжать предыдущую; для «фото» нужно фото.');
    case 'sound_too_long': return tr(locale, 'ხმის აღწერა ძალიან გრძელია.', 'A sound note is too long.', 'Описание звука слишком длинное.');
    default: return tr(locale, 'შეამოწმე ეს სცენა.', 'Check this scene.', 'Проверьте эту сцену.');
  }
}

const input = 'w-full rounded-xl bg-app-bg px-3 py-2 text-[13px] text-app-text ring-1 ring-app-border/20 placeholder:text-app-muted/70 focus:outline-none focus:ring-app-accent/60';
const chip = (on: boolean) => `min-h-[36px] rounded-full px-3 text-[12.5px] font-medium ${on ? 'bg-app-accent text-app-bg' : 'bg-app-bg text-app-text ring-1 ring-app-border/20'}`;

function SceneCard({ locale, project, scene, credits, engine, problems, onChange, onMove, onDuplicate, onRemove }: {
  locale: Lang;
  project: DwProject;
  scene: DwScene;
  credits: number;
  engine: 'veo' | 'omni';
  problems: DwProblem[];
  onChange: (patch: Partial<Omit<DwScene, 'id' | 'order'>>) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const n = project.scenes.length;
  const lines = scene.audio.lines;
  const setAudio = (patch: Partial<DwScene['audio']>) => onChange({ audio: { ...scene.audio, ...patch } });
  const toggleCast = (id: string) =>
    onChange({ characterIds: scene.characterIds.includes(id) ? scene.characterIds.filter((x) => x !== id) : [...scene.characterIds, id] });

  return (
    <li className="rounded-2xl bg-app-elevated p-3 ring-1 ring-app-border/15" data-testid="dw-scene" data-order={scene.order}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-app-bg text-[12px] font-semibold tabular-nums text-app-text">{scene.order}</span>
        <input className={`${input} min-w-0 flex-1`} value={scene.title} maxLength={80} aria-label={tr(locale, 'სცენის სათაური', 'Scene title', 'Название сцены')}
          placeholder={tr(locale, 'სათაური', 'Title', 'Название')} onChange={(e) => onChange({ title: e.target.value })} />
        <span className="shrink-0 rounded-full bg-app-bg px-2.5 py-1 text-[12px] font-semibold tabular-nums text-app-text" data-testid="dw-scene-price">✦{credits}</span>
      </div>

      <textarea className={`${input} mt-2 min-h-[72px]`} value={scene.action} maxLength={1200} aria-label={tr(locale, 'რა ხდება', 'What happens', 'Что происходит')}
        placeholder={tr(locale, 'რა ხდება კადრში', 'What happens on screen', 'Что происходит в кадре')} onChange={(e) => onChange({ action: e.target.value })} />
      <input className={`${input} mt-2`} value={scene.camera} maxLength={200} aria-label={tr(locale, 'კამერა', 'Camera', 'Камера')}
        placeholder={tr(locale, 'კამერა (არასავალდებულო): მსხვილი ხედი, ნელი მიახლოება…', 'Camera (optional): close-up, slow push in…', 'Камера (необязательно): крупный план…')} onChange={(e) => onChange({ camera: e.target.value })} />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {DIRECT_CLIP_SECONDS.map((s) => (
          <button key={s} type="button" className={chip(scene.seconds === s)} onClick={() => onChange({ seconds: s as DirectClipSeconds })}>{s} წმ</button>
        ))}
        <span className="ml-auto text-[11.5px] text-app-muted">{engine === 'omni' ? 'Gemini Omni' : 'Veo'}</span>
      </div>

      {project.characters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={tr(locale, 'კადრში', 'On screen', 'В кадре')}>
          {project.characters.map((c) => (
            <button key={c.id} type="button" className={chip(scene.characterIds.includes(c.id))} onClick={() => toggleCast(c.id)}>{c.name || '—'}</button>
          ))}
        </div>
      )}

      <div className="mt-3">
        <p className="text-[12px] font-medium text-app-muted">{tr(locale, 'ფრაზები (თითოეული საკუთარი ხმით)', 'Lines (each in their own voice)', 'Реплики (каждый своим голосом)')}</p>
        {lines.map((l, i) => (
          <div key={i} className="mt-1.5 flex gap-1.5">
            <select className={`${input} w-28 shrink-0`} value={l.characterId} aria-label={tr(locale, 'ვინ ამბობს', 'Who says it', 'Кто говорит')}
              onChange={(e) => setAudio({ lines: lines.map((x, j) => (j === i ? { ...x, characterId: e.target.value } : x)) })}>
              {project.characters.map((c) => <option key={c.id} value={c.id}>{c.name || '—'}</option>)}
            </select>
            <input className={`${input} min-w-0 flex-1`} value={l.text} maxLength={300}
              onChange={(e) => setAudio({ lines: lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <button type="button" className="shrink-0 px-2 text-app-muted" aria-label={tr(locale, 'წაშლა', 'Remove', 'Удалить')}
              onClick={() => setAudio({ lines: lines.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        {lines.length < DW_MAX_LINES_PER_SCENE && project.characters.length > 0 && (
          <button type="button" className="mt-1.5 text-[12.5px] font-medium text-app-accent"
            onClick={() => setAudio({ lines: [...lines, { characterId: scene.characterIds[0] ?? project.characters[0]!.id, text: '' }] })}>
            + {tr(locale, 'ფრაზა', 'Line', 'Реплика')}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        <input className={input} value={scene.audio.ambience} maxLength={200} placeholder={tr(locale, 'ფონური ხმა: წვიმა, ქუჩა…', 'Ambience: rain, street…', 'Фон: дождь, улица…')}
          onChange={(e) => setAudio({ ambience: e.target.value })} />
        <input className={input} value={scene.audio.effects.join(', ')} maxLength={400} placeholder={tr(locale, 'ეფექტები: კარის ხმა…', 'Effects: a door slams…', 'Эффекты: хлопок двери…')}
          onChange={(e) => setAudio({ effects: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4) })} />
        <input className={input} value={scene.audio.music ?? ''} maxLength={200} placeholder={tr(locale, 'მუსიკა: არა (ცარიელი)', 'Music: none (empty)', 'Музыка: нет (пусто)')}
          onChange={(e) => setAudio({ music: e.target.value.trim() ? e.target.value : null })} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select className={`${input} w-auto`} value={scene.firstFrame} aria-label={tr(locale, 'პირველი კადრი', 'First frame', 'Первый кадр')}
          onChange={(e) => onChange({ firstFrame: e.target.value as DwScene['firstFrame'] })}>
          {scene.order > 1 && <option value="previous">{tr(locale, 'წინა სცენის გაგრძელება', 'Continue previous scene', 'Продолжить предыдущую')}</option>}
          <option value="none">{tr(locale, 'ახალი კადრი', 'Fresh shot', 'Новый кадр')}</option>
        </select>
        <div className="ml-auto flex gap-1">
          <button type="button" disabled={scene.order === 1} className="h-9 w-9 rounded-full bg-app-bg text-app-text disabled:opacity-30" aria-label={tr(locale, 'ზემოთ', 'Move up', 'Выше')} onClick={() => onMove(scene.order - 1)}>↑</button>
          <button type="button" disabled={scene.order === n} className="h-9 w-9 rounded-full bg-app-bg text-app-text disabled:opacity-30" aria-label={tr(locale, 'ქვემოთ', 'Move down', 'Ниже')} onClick={() => onMove(scene.order + 1)}>↓</button>
          <button type="button" disabled={n >= DW_MAX_SCENES} className="h-9 rounded-full bg-app-bg px-3 text-[12px] text-app-text disabled:opacity-30" onClick={onDuplicate}>{tr(locale, 'ასლი', 'Copy', 'Копия')}</button>
          <button type="button" disabled={n <= 1} className="h-9 rounded-full bg-app-bg px-3 text-[12px] text-app-muted disabled:opacity-30" onClick={onRemove}>{tr(locale, 'წაშლა', 'Delete', 'Удалить')}</button>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5" role="alert">
          {problems.map((p, i) => <li key={i} className="text-[12px] text-amber-500">{problemText(locale, p)}</li>)}
        </ul>
      )}
    </li>
  );
}

export function DirectorBoard({ locale, onClose, onApprove, initial }: {
  locale: Lang;
  onClose: () => void;
  /** Phase 8.3: start the film for exactly this version and this price. Absent → the button is shown disabled. */
  onApprove?: (project: DwProject, quote: DwQuote) => void;
  /** A board to reopen (tests, back from a run). */
  initial?: DwProject;
}) {
  const [project, setProject] = useState<DwProject | null>(initial ?? null);
  const [idea, setIdea] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [aspect, setAspect] = useState<DirectClipAspect>('9:16');
  const [resolution, setResolution] = useState<DirectClipResolution>('720p');
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = useMemo(() => (project ? quoteProject(project) : null), [project]);
  const problems = useMemo(() => (project ? validateProject(project) : []), [project]);
  const boardProblems = problems.filter((p) => p.sceneId === null);

  const plan = useCallback(async () => {
    if (!idea.trim() || planning) return;
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch('/api/video/director-workflow/plan', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea, scenes: count, aspect, resolution, locale }),
      });
      const j = (await res.json().catch(() => null)) as { project?: DwProject } | null;
      if (!res.ok || !j?.project) throw new Error(String(res.status));
      setProject(j.project);
    } catch {
      setError(tr(locale, 'სცენარი ვერ შედგა. სცადე თავიდან.', 'Could not make the storyboard. Try again.', 'Не удалось составить раскадровку. Попробуйте снова.'));
    } finally {
      setPlanning(false);
    }
  }, [idea, planning, count, aspect, resolution, locale]);

  const edit = (f: (p: DwProject) => DwProject) => setProject((p) => (p ? f(p) : p));
  const setCharacter = (id: string, patch: Partial<DwCharacter>) =>
    edit((p) => ({ ...p, characters: p.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)), status: 'draft', version: p.version + 1 }));
  const addCharacter = () =>
    edit((p) => (p.characters.length >= DW_MAX_CHARACTERS ? p : { ...p, characters: [...p.characters, { id: newId('c'), name: '', look: '', voice: 'female' }], status: 'draft', version: p.version + 1 }));
  const setFilmResolution = (r: DirectClipResolution) => edit((p) => ({ ...p, resolution: r, status: 'draft', version: p.version + 1 }));

  const canApprove = !!project && !!quote && problems.length === 0 && !!onApprove;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={tr(locale, 'რეჟისორის რეჟიმი', "Director's Workflow", 'Режим режиссёра')}>
      <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-app-surface sm:max-h-[92vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-app-border/10 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-app-text">{tr(locale, 'რეჟისორის რეჟიმი', "Director's Workflow", 'Режим режиссёра')}</h2>
          <button type="button" className="h-9 w-9 rounded-full text-app-muted" aria-label={tr(locale, 'დახურვა', 'Close', 'Закрыть')} onClick={onClose}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!project ? (
            <div className="space-y-3">
              <textarea className={`${input} min-h-[120px]`} value={idea} maxLength={4000} aria-label={tr(locale, 'იდეა', 'Idea', 'Идея')}
                placeholder={tr(locale, 'მოყევი იდეა: ვინ არიან, რა ხდება, რას ამბობენ…', 'Tell the idea: who, what happens, what they say…', 'Опишите идею: кто, что происходит, что говорят…')}
                onChange={(e) => setIdea(e.target.value)} />
              <div>
                <p className="mb-1 text-[12px] font-medium text-app-muted">{tr(locale, 'სცენების რაოდენობა', 'Number of scenes', 'Количество сцен')}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={chip(count === null)} onClick={() => setCount(null)}>{tr(locale, 'ავტო', 'Auto', 'Авто')}</button>
                  {Array.from({ length: DW_MAX_SCENES }, (_, i) => i + 1).map((k) => (
                    <button key={k} type="button" className={chip(count === k)} onClick={() => setCount(k)}>{k}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['9:16', '16:9'] as const).map((a) => <button key={a} type="button" className={chip(aspect === a)} onClick={() => setAspect(a)}>{a}</button>)}
                <span className="w-2" />
                {(['720p', '1080p'] as const).map((r) => <button key={r} type="button" className={chip(resolution === r)} onClick={() => setResolution(r)}>{r}</button>)}
              </div>
              {error && <p className="text-[12.5px] text-amber-500" role="alert">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-app-muted">{tr(locale, 'მთელი ფილმის ხარისხი', 'Whole-film quality', 'Качество всего фильма')}</span>
                {(['720p', '1080p'] as const).map((r) => <button key={r} type="button" className={chip(project.resolution === r)} onClick={() => setFilmResolution(r)}>{r}</button>)}
              </div>

              <section aria-label={tr(locale, 'პერსონაჟები', 'Characters', 'Персонажи')}>
                <p className="mb-1 text-[12px] font-medium text-app-muted">{tr(locale, 'პერსონაჟები (გარეგნობა მეორდება ყველა სცენაში)', 'Characters (the look repeats in every scene)', 'Персонажи (внешность повторяется в каждой сцене)')}</p>
                <ul className="space-y-1.5">
                  {project.characters.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-1.5 rounded-2xl bg-app-elevated p-2 ring-1 ring-app-border/15" data-testid="dw-character">
                      <input className={`${input} w-28`} value={c.name} maxLength={40} placeholder={tr(locale, 'სახელი', 'Name', 'Имя')} onChange={(e) => setCharacter(c.id, { name: e.target.value })} />
                      <input className={`${input} min-w-0 flex-1`} value={c.look} maxLength={400} placeholder={tr(locale, 'გარეგნობა: ასაკი, თმა, ტანსაცმელი', 'Look: age, hair, clothes', 'Внешность: возраст, волосы, одежда')} onChange={(e) => setCharacter(c.id, { look: e.target.value })} />
                      <select className={`${input} w-auto`} value={c.voice} onChange={(e) => setCharacter(c.id, { voice: e.target.value === 'male' ? 'male' : 'female' })}>
                        <option value="female">{tr(locale, 'ქალის ხმა', 'Female voice', 'Женский голос')}</option>
                        <option value="male">{tr(locale, 'კაცის ხმა', 'Male voice', 'Мужской голос')}</option>
                      </select>
                    </li>
                  ))}
                </ul>
                {project.characters.length < DW_MAX_CHARACTERS && (
                  <button type="button" className="mt-1.5 text-[12.5px] font-medium text-app-accent" onClick={addCharacter}>+ {tr(locale, 'პერსონაჟი', 'Character', 'Персонаж')}</button>
                )}
              </section>

              <ol className="space-y-2">
                {[...project.scenes].sort((a, b) => a.order - b.order).map((s) => {
                  const q = quote?.scenes.find((x) => x.sceneId === s.id);
                  return (
                    <SceneCard key={s.id} locale={locale} project={project} scene={s} credits={q?.credits ?? 0} engine={q?.clip.engine ?? 'veo'}
                      problems={problems.filter((p) => p.sceneId === s.id)}
                      onChange={(patch) => edit((p) => updateScene(p, s.id, patch))}
                      onMove={(to) => edit((p) => moveScene(p, s.id, to))}
                      onDuplicate={() => edit((p) => duplicateScene(p, s.id))}
                      onRemove={() => edit((p) => removeScene(p, s.id))} />
                  );
                })}
              </ol>
              {project.scenes.length < DW_MAX_SCENES && (
                <button type="button" className="min-h-[44px] w-full rounded-2xl border border-dashed border-app-border/40 text-[13px] font-medium text-app-text" onClick={() => edit((p) => addScene(p))}>
                  + {tr(locale, 'სცენა', 'Scene', 'Сцена')}
                </button>
              )}
              {boardProblems.map((p, i) => <p key={i} className="text-[12px] text-amber-500" role="alert">{problemText(locale, p)}</p>)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          {!project ? (
            <button type="button" disabled={!idea.trim() || planning} onClick={() => void plan()} className="min-h-[44px] w-full rounded-full bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg disabled:opacity-50" data-testid="dw-plan">
              {planning ? tr(locale, 'სცენარი იწერება…', 'Writing the storyboard…', 'Пишем раскадровку…') : tr(locale, 'სცენარის შექმნა · უფასო', 'Make storyboard · free', 'Создать раскадровку · бесплатно')}
            </button>
          ) : (
            <>
              <span className="text-[12.5px] tabular-nums text-app-muted" data-testid="dw-total">
                {project.scenes.length} {tr(locale, 'სცენა', 'scenes', 'сцен')} · {quote?.totalSeconds ?? 0} {tr(locale, 'წმ', 's', 'с')} · ✦{quote?.totalCredits ?? 0}
              </span>
              <button type="button" disabled={!canApprove} onClick={() => project && quote && onApprove?.(project, quote)}
                className="ml-auto min-h-[44px] rounded-full bg-app-accent px-5 text-[13.5px] font-semibold text-app-bg disabled:opacity-50" data-testid="dw-approve">
                {tr(locale, `ფილმის შექმნა ✦${quote?.totalCredits ?? 0}`, `Create film ✦${quote?.totalCredits ?? 0}`, `Создать фильм ✦${quote?.totalCredits ?? 0}`)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
