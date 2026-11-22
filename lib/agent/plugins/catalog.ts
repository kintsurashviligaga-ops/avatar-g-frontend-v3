/**
 * lib/agent/plugins/catalog.ts — Agent G's 10 plugins and the HONEST state of each for one user. Isomorphic data plus a
 * pure resolver; GET /api/agent/plugins feeds it the facts (flags, config, links) and the Plugins sheet shows the answer.
 *
 * A plugin is a name for things that already run (tools in lib/agent/react/bindLiveAgent + lib/agent/plugins/tools,
 * and studio routes). Nothing here is aspirational: catalog.test.ts pins every tool to the live allowlist and every
 * route to a file. A plugin that needs an outside account says "not connected" or "needs setup"; one that waits on
 * someone else (Google's verification, the paused database) says so with a blocker code, never a dead button.
 */
import type { Blocker, Lang, PluginStatus } from './messages';

export type PluginId =
  | 'google_drive' | 'web_research' | 'code_sandbox' | 'documents' | 'image_studio'
  | 'voice_music' | 'video_avatar' | 'notion' | 'github' | 'calendar';

export interface PluginDef {
  id: PluginId;
  name: Record<Lang, string>;
  does: Record<Lang, string>;
  /** Agent G tools that back it (every name exists in the live allowlist). */
  tools: readonly string[];
  /** Routes that run it (every file exists). */
  routes: readonly string[];
  /** Linked per user through the Connectors sheet. */
  connectable: boolean;
}

export const PLUGINS: readonly PluginDef[] = [
  {
    id: 'google_drive', connectable: true,
    name: { ka: 'Google Drive', en: 'Google Drive', ru: 'Google Drive' },
    does: { ka: 'არჩეული ფაილების კითხვა და ანალიზი', en: 'Read and analyse the files you pick', ru: 'Чтение и анализ выбранных файлов' },
    tools: ['drive_list_files', 'drive_read_file'],
    routes: ['app/api/connectors/google_drive/connect/route.ts', 'app/api/connectors/google_drive/picker/route.ts', 'app/api/connectors/google_drive/files/route.ts'],
  },
  {
    id: 'web_research', connectable: false,
    name: { ka: 'ვებ-ძიება და კვლევა', en: 'Web search & research', ru: 'Веб-поиск и исследование' },
    does: { ka: 'ინტერნეტში ძიება, წყაროები, სიახლეები, ფაქტების გადამოწმება', en: 'Search the web with sources, news and fact checks', ru: 'Поиск в сети с источниками, новости, проверка фактов' },
    tools: ['web_search', 'scrape_webpage'],
    routes: ['app/api/agent/run/route.ts'],
  },
  {
    id: 'code_sandbox', connectable: false,
    name: { ka: 'კოდი და მონაცემები', en: 'Code & data sandbox', ru: 'Код и данные' },
    does: { ka: 'Python/JS გაშვება, ცხრილები, დიაგრამები, შეცდომების გასწორება', en: 'Run Python/JS, tables, charts, fix errors', ru: 'Запуск Python/JS, таблицы, графики, исправление ошибок' },
    tools: ['quote_code_run', 'workspace_list_files', 'workspace_read_file', 'workspace_write_file'],
    routes: ['app/api/agent/run/route.ts'],
  },
  {
    id: 'documents', connectable: false,
    name: { ka: 'დოკუმენტები და PDF', en: 'Documents & PDF', ru: 'Документы и PDF' },
    does: { ka: 'PDF, DOCX, CSV, TXT — შეჯამება, ძიება, ამოღება', en: 'PDF, DOCX, CSV, TXT: summarise, search, extract', ru: 'PDF, DOCX, CSV, TXT: сводка, поиск, извлечение' },
    tools: ['analyze_media', 'drive_read_file', 'workspace_read_file'],
    routes: ['app/api/agent/media/analyze/route.ts'],
  },
  {
    id: 'image_studio', connectable: false,
    name: { ka: 'სურათები', en: 'Image generation & editing', ru: 'Изображения' },
    does: { ka: 'გენერაცია, რედაქტირება, ზომა და ფორმატი', en: 'Generate, edit, size and format', ru: 'Создание, редактирование, размер и формат' },
    tools: ['quote_image'],
    routes: ['app/api/image/jobs/route.ts'],
  },
  {
    id: 'voice_music', connectable: false,
    name: { ka: 'ხმა და მუსიკა', en: 'Voice, audio & music', ru: 'Голос, аудио и музыка' },
    does: { ka: 'დიქტაცია, ხმოვანი კითხვა, მუსიკა, აუდიოს ამოღება', en: 'Dictation, read-aloud, music, audio extraction', ru: 'Диктовка, чтение вслух, музыка, извлечение аудио' },
    tools: ['quote_audio_from_link'],
    routes: ['app/api/voice/transcribe/route.ts', 'app/api/tts/gemini/route.ts', 'app/api/music/studio/jobs/route.ts'],
  },
  {
    id: 'video_avatar', connectable: false,
    name: { ka: 'ვიდეო და ავატარი', en: 'Video & avatar studio', ru: 'Видео и аватар' },
    does: { ka: 'კლიპები, მონტაჟი, ავატარი, სტატუსები', en: 'Clips, montage, avatar, job status', ru: 'Клипы, монтаж, аватар, статусы' },
    tools: ['quote_montage_to_music', 'quote_video_assembly', 'quote_media_edit'],
    routes: ['app/api/tasks/route.ts'],
  },
  {
    id: 'notion', connectable: true,
    name: { ka: 'Notion', en: 'Notion', ru: 'Notion' },
    does: { ka: 'გვერდების ძიება, კითხვა და ახალი გვერდის მომზადება', en: 'Search and read pages, draft new ones', ru: 'Поиск и чтение страниц, черновики новых' },
    tools: ['notion_search', 'notion_read_page', 'notion_prepare_page'],
    routes: ['app/api/connectors/notion/connect/route.ts', 'app/api/connectors/notion/pages/route.ts'],
  },
  {
    id: 'github', connectable: true,
    name: { ka: 'GitHub', en: 'GitHub', ru: 'GitHub' },
    does: { ka: 'რეპოზიტორიები, issue-ები, PR-ები, კოდის ანალიზი', en: 'Repos, issues, PRs, code analysis', ru: 'Репозитории, issues, PR, анализ кода' },
    tools: ['github_list_repos', 'github_list_issues', 'github_read_file', 'github_prepare_issue'],
    routes: ['app/api/connectors/github/connect/route.ts'],
  },
  {
    id: 'calendar', connectable: false,
    name: { ka: 'კალენდარი და შეხსენებები', en: 'Calendar & reminders', ru: 'Календарь и напоминания' },
    does: { ka: 'შეხვედრა შენს დროის ზონაში: Google Calendar ბმული და .ics ფაილი', en: 'An event in your time zone: Google Calendar link and .ics file', ru: 'Встреча в вашем часовом поясе: ссылка Google Calendar и файл .ics' },
    tools: ['calendar_prepare_event'],
    routes: ['app/api/agent/plugins/route.ts'],
  },
];

/** The facts the resolver needs about one user. The route reads them; tests pass them by hand. */
export interface PluginFacts {
  /** AGENT_PLUGINS opens the plugin set to this user. */
  pluginsOn: boolean;
  drive: { open: boolean; configured: boolean; tableReady: boolean; linked: boolean };
  notion: { open: boolean; configured: boolean; tableReady: boolean; linked: boolean };
  github: { open: boolean; configured: boolean; tableReady: boolean; linked: boolean };
  sandbox: boolean;
  analyze: boolean;
  media: boolean;
  /** The production database answers (false while Supabase is paused). */
  dbUp: boolean;
}

export interface PluginState {
  id: PluginId;
  status: PluginStatus;
  connectable: boolean;
  linked?: boolean;
  blockers: Blocker[];
}

function linkState(f: PluginFacts['drive'], dbUp: boolean, appBlocker: Blocker): Pick<PluginState, 'status' | 'blockers' | 'linked'> {
  if (!f.open) return { status: 'off', blockers: [] };
  if (!f.configured) return { status: 'needs_setup', blockers: [appBlocker] };
  if (!dbUp) return { status: 'needs_setup', blockers: ['db_paused'] };
  if (!f.tableReady) return { status: 'needs_setup', blockers: ['migration_pending'] };
  return f.linked ? { status: 'ready', blockers: [], linked: true } : { status: 'not_connected', blockers: [], linked: false };
}

export function resolvePlugins(f: PluginFacts): PluginState[] {
  return PLUGINS.map((p): PluginState => {
    const base = { id: p.id, connectable: p.connectable };
    switch (p.id) {
      case 'google_drive': return { ...base, ...linkState(f.drive, f.dbUp, 'provider_app_missing') };
      case 'notion': return { ...base, ...linkState(f.notion, f.dbUp, 'provider_app_missing') };
      case 'github': return { ...base, ...linkState(f.github, f.dbUp, 'provider_app_missing') };
      case 'web_research': return { ...base, status: 'ready', blockers: [] };
      case 'code_sandbox': return { ...base, status: f.sandbox ? 'ready' : 'off', blockers: f.sandbox ? [] : ['admins_only'] };
      case 'documents':
        // PDF/picture/video via analyze_media; DOCX/CSV/TXT via a picked Drive file or the workspace.
        if (f.analyze && (f.drive.linked || f.sandbox)) return { ...base, status: 'ready', blockers: [] };
        if (f.analyze || f.drive.linked || f.sandbox) return { ...base, status: 'partial', blockers: [] };
        return { ...base, status: 'off', blockers: ['admins_only'] };
      // The studio services run in production for every signed-in user; Agent G hands work to them.
      case 'image_studio': case 'voice_music': case 'video_avatar':
        return { ...base, status: f.dbUp ? 'ready' : 'partial', blockers: f.dbUp ? [] : ['db_paused'] };
      case 'calendar':
        // Links and .ics work now; Google Calendar sync waits on Google's verification, stored reminders on the database.
        return f.pluginsOn
          ? { ...base, status: 'partial', blockers: ['google_verification', ...(f.dbUp ? ['migration_pending' as const] : ['db_paused' as const])] }
          : { ...base, status: 'off', blockers: [] };
    }
  });
}
