'use client';

import { TOOL_META, toolName, type ToolId } from '@/lib/studio/tools';

/**
 * THE CHAT HOME'S FOUR QUICK BUTTONS (GG's UI plan, 2026-10-18: „ერთი მთავარი შესატანი ველი და ოთხი სწრაფი მოქმედების
 * ღილაკი (ვიდეო, სურათი, მუსიკა, ავატარი)“). They sit under the empty chat's box and open that tool; whatever is typed in
 * the box goes with it as the tool's description (the composer and the Create screens share one text), so a prompt written
 * in the chat is handed to the tool, never typed twice. Nothing is generated or charged here: the tool's own Create button
 * carries the price and starts the job.
 */
export const QUICK_TOOLS = ['video', 'image', 'music', 'avatar'] as const satisfies readonly ToolId[];
export type QuickTool = (typeof QUICK_TOOLS)[number];

const GROUP_LABEL = { ka: 'სწრაფი შექმნა', en: 'Quick create', ru: 'Быстрое создание' } as const;

export function HomeQuickStart({ locale, onPick }: { locale: string; onPick: (tool: QuickTool) => void }) {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return (
    // A phone has 358 px for four: an icon over a short name in four equal cells. From `sm` they are pills in one row.
    <div role="group" aria-label={GROUP_LABEL[lang]} data-testid="home-quick"
      className="mx-auto mt-3 grid w-full max-w-[640px] grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-center">
      {QUICK_TOOLS.map((id) => {
        const { Icon } = TOOL_META[id];
        return (
          <button key={id} type="button" data-testid={`home-quick-${id}`} onClick={() => onPick(id)}
            className="flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl bg-app-elevated/60 px-1 py-2 text-[12px] font-medium leading-tight text-app-text ring-1 ring-app-border/15 transition-colors duration-200 hover:bg-app-elevated hover:ring-app-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent touch-manipulation sm:min-h-[44px] sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-0 sm:text-[14px]">
            <Icon size={18} aria-hidden="true" className="shrink-0 text-app-accent" />
            <span className="max-w-full truncate">{toolName(id, locale)}</span>
          </button>
        );
      })}
    </div>
  );
}
