'use client';

/**
 * SkillsTab — what Agent G can do, read-only, grouped (talk · create · read · research · channels). Each row's state comes from
 * a signal that already exists on this deployment (components/studio/hub/skills.ts lists them), so the tab never promises
 * what the server has not said. No toggles: there is no server-side per-user skill preference to switch — the Plugins tab
 * hides MENU rows, and a hidden generator is only noted here, never marked unavailable (Agent G can still make it).
 */
import { useEffect, useId, useState } from 'react';
import { FileSearch, FileText, Film, FolderOpen, Globe, Image as ImageIcon, MessageCircle, MessageSquare, Mic, Music2, Send, Video, type LucideIcon } from 'lucide-react';
import { researchActions, useResearchSelector } from '@/components/studio/research/store';
import { isEnabledByDefault } from '@/lib/env/flag';
import { SERVICE_CATALOGUE } from '@/lib/services/serviceCatalogue';
import { hubCopy, type SkillId, type SkillState } from './copy';
import { StateTag } from './parts';
import { skillGroups, type SkillNote, type SkillSignals } from './skills';
import { useHiddenTools, useHubSelector } from './store';

const LIVE_VOICE = isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);
const serviceLive = (id: 'chat' | 'image' | 'video' | 'music') => SERVICE_CATALOGUE.find((s) => s.id === id)?.live === true;

const ICONS: Record<SkillId, LucideIcon> = {
  chat: MessageSquare, live: Mic, image: ImageIcon, video: Film, music: Music2,
  filesChat: FileText, videoChat: Video, docs: FolderOpen, research: FileSearch,
  web: Globe, telegram: Send, whatsapp: MessageCircle,
};

export function SkillsTab({ locale, authed }: { locale: string; authed: boolean }) {
  const c = hubCopy(locale);
  const headId = useId();
  const caps = useResearchSelector((s) => s.caps);
  const channels = useHubSelector((s) => s.channels);
  const hidden = useHiddenTools();
  // The research capability probe is shared with the composer (cached in the research store); "settled" tells a failed
  // probe (→ "not checked") from one still in flight (→ "checking").
  const [capsSettled, setCapsSettled] = useState(false);
  useEffect(() => {
    let live = true;
    void researchActions.ensureCapabilities().finally(() => { if (live) setCapsSettled(true); });
    return () => { live = false; };
  }, []);

  const signals: SkillSignals = {
    guest: !authed,
    liveVoice: LIVE_VOICE,
    serviceLive,
    research: caps ? { available: caps.available, filesAvailable: caps.filesAvailable } : capsSettled ? 'unknown' : 'checking',
    channels: channels.status === 'ready' ? { telegramReady: channels.telegramReady, whatsappReady: channels.whatsappReady }
      : channels.status === 'failed' ? 'unknown' : 'checking',
    hidden,
  };
  const notes: Record<SkillNote, string> = { hidden: c.hiddenNote, tg: c.tgSkillNote, wa: c.waSkillNote, guestChat: c.guestChatNote };
  const tag = (s: SkillState) => <StateTag label={c.states[s]} accent={s === 'available'} />;

  return (
    <div className="space-y-4 px-2 pb-2 pt-1" data-testid="skills-tab">
      <p className="text-[13.5px] leading-relaxed text-app-muted">{c.skillsLead}</p>
      {skillGroups(signals).map((g) => {
        const group = c.groups[g.id];
        return (
          <section key={g.id} aria-labelledby={`${headId}-${g.id}`} data-testid={`skill-group-${g.id}`}>
            <h3 id={`${headId}-${g.id}`} className="px-1 text-[12px] font-medium text-app-muted">{group.title}</h3>
            {group.sub && <p className="px-1 pt-0.5 text-[12px] leading-snug text-app-muted/90">{group.sub}</p>}
            <ul className="mt-1 space-y-0.5">
              {g.rows.map((r) => {
                const Icon = ICONS[r.id];
                return (
                  <li key={r.id} data-testid={`skill-${r.id}`} data-state={r.state} className="flex min-h-[48px] items-center gap-3.5 rounded-2xl px-3 py-1.5">
                    <Icon size={18} aria-hidden="true" className="shrink-0 text-app-text/75" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] leading-tight text-app-text">{c.skills[r.id]}</span>
                      {r.note && <span className="mt-0.5 block text-[12px] leading-tight text-app-muted">{notes[r.note]}</span>}
                    </span>
                    {tag(r.state)}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
