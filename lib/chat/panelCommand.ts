/**
 * lib/chat/panelCommand.ts — „გახსენი ვიდეო", „გავაკეთოთ ავატარი", „ჩაკეტე პანელი", „დაბრუნდი ჩატში": the studio's own
 * controls, typed or spoken, in whatever tool is open (GG's plan 2026-10-17 11:28Z, item 1: Agent G opens and closes the
 * services by voice at any moment, „in one chat, without a hitch").
 *
 * WHY. Every open-route of the chat (studioIntent, agentRoute, chatTurn's intents) runs only while the composer is in plain
 * chat, and the composer stays in the tool of the last result: a first film leaves it in Video. So after the first task
 * „გახსენი ავატარი" became the Video tool's next brief, „გავაკეთოთ ავატარი" an avatar card whose script was those two words,
 * and nothing anywhere closed a panel. A command is read here first, before any tool reads the words as its prompt, and it
 * changes the tool in the SAME conversation (no new chat): the thread, its results and Agent G's context stay.
 *
 * WHAT A COMMAND IS. The whole message is one verb and the one thing it names: open · close · back to · let's make, a tool or
 * a panel, and only filler around them („please", „the", „now", „გთხოვ"). Anything more is not a command and goes on to the
 * routers as before: „გახსენი ვიდეო და დაამატე მუსიკა", „გავაკეთოთ ვიდეო ზღვაზე", „open a video of a cat", a question
 * („როგორ გავხსნა ვიდეო?"), a negation („არ დახურო"). Nothing here spends: opening a tool only shows it.
 *
 * Pure and client-safe. `decidePanelCommand` turns a command and what is on screen into what to do and what to say;
 * OmniStudio carries it out (typed and dictated messages, and a Live call's close_panel).
 */
import type { ToolId } from '@/lib/studio/tools';

/** Panels outside the tools (lib/voice/liveTools LIVE_PANELS). `settings` = the open tool's own settings. */
export type CommandPanel = 'settings' | 'credits' | 'persona' | 'search' | 'history';

export type PanelCommand =
  /** `via: 'make'` — „გავაკეთოთ ავატარი", a make-verb with nothing to make yet: the tool opens and Agent G asks for the rest. */
  | { kind: 'open'; tool: ToolId; via: 'open' | 'make' }
  | { kind: 'panel'; panel: CommandPanel }
  /** panel: the open tool's settings, else the tool itself · settings: the settings only · tool: the tool, back to the chat. */
  | { kind: 'close'; what: 'panel' | 'settings' | 'tool'; tool?: ToolId };

const MAX_CHARS = 80;
const MAX_WORDS = 8;

const L = '\\p{L}*';
const re = (alts: string) => new RegExp(`^(?:${alts})$`, 'u');

/** Several words that name one tool. Read before the single words, so „ვიდეოს მონტაჟი" is not Video and Montage at once. */
const PHRASES: ReadonlyArray<{ tool: ToolId; re: RegExp }> = ([
  ['montage', `ვიდეო(?:ს)?\\s+მონტაჟ${L}|ვიდეო\\s+რედაქტორ${L}|video\\s+(?:editing|editor)|видео\\s*монтаж${L}|видеоредактор${L}|редактор\\s+видео`],
  ['product', `პროდუქტ(?:ის)?\\s+რეკლამ${L}|product\\s+ads?|реклам${L}\\s+продукт${L}`],
  ['swap', `პერსონაჟ(?:ის)?\\s+(?:შეცვლ|ჩანაცვლებ)${L}|(?:character|face)\\s+swap|замен${L}\\s+персонаж${L}`],
  ['motion', `მოძრაობ(?:ის)?\\s+გადატან${L}|motion\\s+transfer|перенос${L}\\s+движени${L}`],
  ['photo', `ფოტო(?:ებ)?(?:ის)?\\s+(?:შერჩევ|არჩევ)${L}|photo\\s+culling|отбор${L}\\s+фото`],
  ['interior', `ინტერიერ(?:ის)?\\s+დიზაინერ${L}|interior\\s+designer|дизайнер${L}\\s+интерьер${L}`],
  ['model3d', `3\\s*d[\\s-]*(?:მოდელ${L}|models?|модел${L})`],
  ['vfx', `vfx\\s+(?:ეფექტ${L}|effects?|эффект${L})`],
  ['video', `მუსიკალურ${L}\\s+კლიპ${L}|music\\s+video|музыкальн${L}\\s+клип${L}`],
] as const).map(([tool, alts]) => ({ tool, re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'giu') }));

/** One word that names a tool. „ფოტო" is the Image tool; the photographer and the culling have their own words. */
const TOOL_WORDS: ReadonlyArray<{ tool: ToolId; re: RegExp }> = ([
  ['chat', `ჩატ${L}|chat|чат${L}`],
  ['video', `ვიდეო${L}|ფილმ${L}|video|videos|film|movie|видео|фильм${L}|ролик${L}`],
  ['image', `სურათ${L}|ფოტო(?:ს|ზე|ში|თი)?|ნახატ${L}|გამოსახულებ${L}|image|images|picture|pictures|photo|изображени${L}|картинк${L}|фото`],
  ['music', `მუსიკ${L}|სიმღერ${L}|music|song|songs|музык${L}|песн${L}`],
  ['avatar', `ავატარ${L}|avatar|avatars|аватар${L}`],
  ['montage', `მონტაჟ${L}|რედაქტორ${L}|montage|editor|editing|монтаж${L}|видеомонтаж${L}|редактор${L}`],
  ['dubbing', `დუბლაჟ${L}|დუბლირებ${L}|dubbing|dub|дубляж${L}`],
  ['presentation', `პრეზენტაცი${L}|სლაიდ${L}|presentation|presentations|slides|deck|презентаци${L}|слайд${L}`],
  ['model3d', `3d`],
  ['vfx', `vfx|ეფექტ${L}|effects|эффект${L}`],
  ['interior', `ინტერიერ${L}|interior|интерьер${L}`],
  ['photoshoot', `ფოტოგრაფ${L}|ფოტოსესი${L}|photographer|photoshoot|фотограф${L}|фотосесси${L}`],
  ['product', `რეკლამ${L}|ad|ads|реклам${L}`],
  ['swap', `swap`],
  ['motion', `motion`],
  ['photo', `culling`],
] as const).map(([tool, alts]) => ({ tool, re: re(alts) }));

const PANEL_WORDS: ReadonlyArray<{ panel: CommandPanel; re: RegExp }> = ([
  ['settings', `პარამეტრ${L}|სეთინგ${L}|settings|options|preferences|настройк${L}|параметр${L}`],
  ['credits', `კრედიტ${L}|ბალანს${L}|credits|credit|balance|wallet|кредит${L}|баланс${L}`],
  // Not „პერსონაჟი" (a character): the persona alone, in its few cases.
  ['persona', `პერსონა(?:ს|ზე)?|persona|персон(?:а|у|ы)`],
  ['search', `ძებნ${L}|ძიებ${L}|search|поиск${L}`],
  ['history', `ისტორი${L}|history|истори${L}`],
] as const).map(([panel, alts]) => ({ panel, re: re(alts) }));

/** „the panel", „the window" — what close and open act on when no tool is named. */
const PANEL_GENERIC = re(`პანელ${L}|ფანჯარ${L}|ფანჯრ${L}|panel|window|sheet|панел${L}|окн${L}|окно`);
/** „the tool", „the service", „the studio" — the open tool itself. */
const TOOL_GENERIC = re(`ხელსაწყ${L}|სერვის${L}|სტუდი${L}|რეჟიმ${L}|განყოფილებ${L}|tool|service|studio|mode|section|tab|инструмент${L}|сервис${L}|студи${L}|режим${L}|раздел${L}`);

const OPEN_VERB = re(`გა(?:მი|ვ)?ხსენ${L}|გავხსნ${L}|გადადი|გადავიდ${L}|გადამიყვან${L}|გადართ${L}|გადამრთ${L}|open|opens|switch|take|открой${L}|открыть|перейди|перейдём|перейдем|переключи${L}`);
/** „go to …", „get me to …": an open only when nothing stronger is said („go back to the chat" is back). */
const WEAK_OPEN_VERB = re(`go|get`);
const MAKE_VERB = re(`გავაკეთ${L}|გა(?:მი)?აკეთ${L}|შევქმნ${L}|შე(?:მი)?ქმენ${L}|დავიწყ${L}|make|create|do|start|сделаем|сделай${L}|создай${L}|создадим|начнём|начнем`);
const CLOSE_VERB = re(`და(?:მი|ვ)?ხურ${L}|ჩა(?:მი)?კეტ${L}|გამოდი|გამოვიდ${L}|close|hide|exit|leave|quit|закрой${L}|закрыть|скрой${L}|выйди|выйти|убери`);
const BACK_VERB = re(`დაბრუნდ${L}|დავბრუნდ${L}|დამაბრუნ${L}|back|return|вернись|вернуться|вернёмся|вернемся|верни|назад`);

/** Words that carry no request of their own. „და" (and) is NOT one: „გახსენი ვიდეო და …" asks for more than a panel. */
const FILLER = re(
  'გთხოვ|გთხოვთ|ახლა|ახლავე|მოდი|აბა|ჩემთვის|ეს|ეგ|ამ|ისევ|კიდევ|ერთი|ერთ|'
  + 'please|pls|the|a|an|my|now|again|for|me|us|to|into|in|on|of|up|it|this|that|let|lets|let\'s|can|you|could|'
  + 'пожалуйста|сейчас|мне|давай|давайте|ну|в|во|на|к|ко|снова|это|эту|этот',
);

/** A question is never a command: Agent G answers it („როგორ გავხსნა ვიდეო?" asks how). */
const QUESTION = /[?？]|^\s*(?:რა|როგორ|რატომ|სად|როდის|შეიძლება|შეგიძლია|what|how|why|where|when|can you|could you|is|are|do|does|что|как|почему|где|когда|можно|можешь)(?![\p{L}\p{N}])/iu;

const normalize = (text: string): string =>
  text.normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/[’]/g, '\'');

type Verb = 'open' | 'make' | 'close' | 'back';

/** The command a whole message is, or null when it says anything more (it then goes on to the routers as before). */
export function panelCommand(text: string | null | undefined): PanelCommand | null {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > MAX_CHARS || QUESTION.test(raw)) return null;
  let s = normalize(raw);
  const phraseTools: ToolId[] = [];
  for (const p of PHRASES) {
    s = s.replace(p.re, () => { phraseTools.push(p.tool); return ' '; });
  }
  const words = s.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];
  if (words.length + phraseTools.length > MAX_WORDS) return null;
  const verbs = new Set<Verb>();
  let weakOpen = false;
  const tools: ToolId[] = [...phraseTools];
  const panels: CommandPanel[] = [];
  let genericPanel = false;
  let genericTool = false;
  for (const w of words) {
    if (OPEN_VERB.test(w)) verbs.add('open');
    else if (MAKE_VERB.test(w)) verbs.add('make');
    else if (CLOSE_VERB.test(w)) verbs.add('close');
    else if (BACK_VERB.test(w)) verbs.add('back');
    else if (WEAK_OPEN_VERB.test(w)) weakOpen = true;
    else {
      const tool = TOOL_WORDS.find((t) => t.re.test(w))?.tool;
      if (tool) { tools.push(tool); continue; }
      const panel = PANEL_WORDS.find((p) => p.re.test(w))?.panel;
      if (panel) { panels.push(panel); continue; }
      if (PANEL_GENERIC.test(w)) { genericPanel = true; continue; }
      if (TOOL_GENERIC.test(w)) { genericTool = true; continue; }
      if (FILLER.test(w)) continue;
      return null;
    }
  }
  // „go back to the chat": back wins over a weak „go"; two real verbs („open and close") are not one command.
  if (verbs.size > 1) return null;
  const verb: Verb | null = [...verbs][0] ?? (weakOpen ? 'open' : null);
  if (!verb) return null;
  const named = new Set(tools);
  if (named.size + panels.length > 1) return null;
  const tool = [...named][0];
  const panel = panels[0];
  switch (verb) {
    case 'open':
      if (tool) return { kind: 'open', tool, via: 'open' };
      if (panel) return { kind: 'panel', panel };
      // „გახსენი პანელი" / „open the panel": the open tool's settings.
      return genericPanel && !genericTool ? { kind: 'panel', panel: 'settings' } : null;
    case 'make':
      return tool && tool !== 'chat' && !panel ? { kind: 'open', tool, via: 'make' } : null;
    case 'close':
      if (tool) return tool === 'chat' ? null : { kind: 'close', what: 'tool', tool };
      if (panel) return panel === 'settings' ? { kind: 'close', what: 'settings' } : null;
      return { kind: 'close', what: genericTool && !genericPanel ? 'tool' : 'panel' };
    case 'back':
      if (tool === 'chat') return { kind: 'close', what: 'tool' };
      return tool && !panel ? { kind: 'open', tool, via: 'open' } : null;
  }
}

/** What is on screen, as far as a command is concerned. */
export interface PanelScreen {
  tool: ToolId;
  /** The open tool's settings are showing (the desktop column, or the phone's sheet). */
  settingsOpen: boolean;
}

export type PanelOutcome =
  | { did: 'opened'; tool: ToolId }
  | { did: 'already'; tool: ToolId }
  | { did: 'panel'; panel: CommandPanel }
  | { did: 'no-settings' }
  | { did: 'closed-settings' }
  | { did: 'settings-closed' }
  | { did: 'closed-tool'; tool: ToolId }
  | { did: 'nothing' }
  | { did: 'not-open'; tool: ToolId };

/** What the studio does: switch the tool (in the same conversation), show or hide its settings, open a panel. */
export interface PanelAct {
  tool?: ToolId;
  settings?: 'open' | 'close';
  panel?: Exclude<CommandPanel, 'settings'>;
}

/** Tools whose whole screen is a panel of its own: closing „the panel" closes the tool. */
const PANEL_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['dubbing', 'model3d', 'presentation', 'interior', 'photoshoot', 'montage', 'photo']);

export function decidePanelCommand(cmd: PanelCommand, screen: PanelScreen): { act: PanelAct; outcome: PanelOutcome } {
  const here = screen.tool;
  switch (cmd.kind) {
    case 'open':
      if (cmd.tool === here) {
        // Already there: bring its settings up, so the next step is on screen.
        return here === 'chat' || screen.settingsOpen || PANEL_TOOLS.has(here)
          ? { act: {}, outcome: { did: 'already', tool: here } }
          : { act: { settings: 'open' }, outcome: { did: 'already', tool: here } };
      }
      return { act: { tool: cmd.tool }, outcome: cmd.tool === 'chat' ? { did: 'closed-tool', tool: here } : { did: 'opened', tool: cmd.tool } };
    case 'panel':
      if (cmd.panel !== 'settings') return { act: { panel: cmd.panel }, outcome: { did: 'panel', panel: cmd.panel } };
      if (here === 'chat') return { act: {}, outcome: { did: 'no-settings' } };
      return { act: screen.settingsOpen ? {} : { settings: 'open' }, outcome: { did: 'panel', panel: 'settings' } };
    case 'close': {
      if (cmd.what === 'tool' && cmd.tool && cmd.tool !== here) return { act: {}, outcome: { did: 'not-open', tool: cmd.tool } };
      if (here === 'chat') return { act: {}, outcome: { did: 'nothing' } };
      // A studio that IS its panel (dubbing, a deck, the editor …) closes as a whole, whatever was named.
      if (PANEL_TOOLS.has(here) || cmd.what === 'tool') return { act: { tool: 'chat' }, outcome: { did: 'closed-tool', tool: here } };
      if (screen.settingsOpen) return { act: { settings: 'close' }, outcome: { did: 'closed-settings' } };
      // „Close the panel" with the settings already put away: the tool itself. „Close the settings": nothing left to close.
      return cmd.what === 'panel'
        ? { act: { tool: 'chat' }, outcome: { did: 'closed-tool', tool: here } }
        : { act: {}, outcome: { did: 'settings-closed' } };
    }
  }
}

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** What Agent G says it did, in the UI language. `nameOf` gives a tool's name (lib/studio/tools toolName). */
export function panelCommandReply(outcome: PanelOutcome, locale: string, nameOf: (tool: ToolId) => string): string {
  const l = lang(locale);
  const pick = (ka: string, en: string, ru: string) => (l === 'en' ? en : l === 'ru' ? ru : ka);
  switch (outcome.did) {
    case 'opened': {
      const name = `**${nameOf(outcome.tool)}**`;
      const next = outcome.tool === 'video' ? pick('მითხარი, რა უნდა ჩანდეს კლიპში.', 'Tell me what the clip should show.', 'Скажите, что должно быть в клипе.')
        : outcome.tool === 'image' ? pick('აღწერე, რა დავხატო.', 'Describe what to draw.', 'Опишите, что нарисовать.')
          : outcome.tool === 'music' ? pick('მითხარი, როგორი მუსიკა გინდა.', 'Tell me what music you want.', 'Скажите, какую музыку сделать.')
            : outcome.tool === 'avatar' ? pick('დაწერე, რა თქვას ავატარმა, ან დაურთე ფოტო.', 'Write what the avatar says, or attach a photo.', 'Напишите, что скажет аватар, или прикрепите фото.')
              : '';
      const head = pick(`გავხსენი ${name}.`, `Opened ${name}.`, `Открыл ${name}.`);
      return next ? `${head} ${next}` : head;
    }
    case 'already':
      return outcome.tool === 'chat'
        ? pick('ჩატში ვართ.', 'We are in the chat.', 'Мы в чате.')
        : pick(`**${nameOf(outcome.tool)}** უკვე ღიაა.`, `**${nameOf(outcome.tool)}** is already open.`, `**${nameOf(outcome.tool)}** уже открыт.`);
    case 'panel':
      switch (outcome.panel) {
        case 'settings': return pick('გავხსენი პარამეტრები.', 'Opened the settings.', 'Открыл настройки.');
        case 'credits': return pick('გავხსენი კრედიტები.', 'Opened your credits.', 'Открыл кредиты.');
        case 'persona': return pick('გავხსენი პერსონა.', 'Opened the persona.', 'Открыл персону.');
        case 'search': return pick('გავხსენი ძებნა.', 'Opened the search.', 'Открыл поиск.');
        case 'history': return pick('გავხსენი ისტორია.', 'Opened the history.', 'Открыл историю.');
      }
      return '';
    case 'no-settings':
      return pick('ჩატს პარამეტრები არ აქვს. ჯერ ხელსაწყო გახსენი, მაგალითად „გახსენი ვიდეო“.', 'The chat has no settings. Open a tool first, for example „open video“.', 'У чата нет настроек. Сначала откройте инструмент, например «открой видео».');
    case 'closed-settings':
      return pick('დავხურე პარამეტრები.', 'Closed the settings.', 'Закрыл настройки.');
    case 'settings-closed':
      return pick('პარამეტრები უკვე დახურულია.', 'The settings are already closed.', 'Настройки уже закрыты.');
    case 'closed-tool':
      return pick(`დავხურე **${nameOf(outcome.tool)}**, ჩატში ვართ.`, `Closed **${nameOf(outcome.tool)}**; we are back in the chat.`, `Закрыл **${nameOf(outcome.tool)}**, мы снова в чате.`);
    case 'nothing':
      return pick('დასახური არაფერია: ჩატში ვართ.', 'Nothing is open; we are in the chat.', 'Закрывать нечего: мы в чате.');
    case 'not-open':
      return pick(`**${nameOf(outcome.tool)}** ღია არ არის.`, `**${nameOf(outcome.tool)}** is not open.`, `**${nameOf(outcome.tool)}** не открыт.`);
  }
}
