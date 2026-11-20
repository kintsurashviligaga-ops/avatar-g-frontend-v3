'use client';

/**
 * NotionDraftCard — a Notion page Agent G PREPARED (notion_prepare_page). Nothing is in Notion until the user presses
 * Save: that press, with their session, calls POST /api/connectors/notion/pages. Each failure is said in ka/en/ru.
 */
import { useState } from 'react';
import type { NotionDraft } from '@/lib/agent/plugins/tools';

type Lang = 'ka' | 'en' | 'ru';
const T = {
  ka: { head: 'Notion-ის გვერდის მონახაზი', save: 'Notion-ში შენახვა', saving: 'ინახება…', saved: 'შენახულია.', open: 'გახსნა', not_connected: 'Notion არ არის დაკავშირებული. დააკავშირე კონექტორების ღილაკიდან.', forbidden: 'ეს გვერდი MyAvatar-ს არ აქვს გაზიარებული Notion-ში.', failed: 'Notion-მა არ უპასუხა. სცადე თავიდან.', note: 'ჯერ არაფერია შენახული.' },
  en: { head: 'Notion page draft', save: 'Save to Notion', saving: 'Saving…', saved: 'Saved.', open: 'Open', not_connected: 'Notion is not connected. Connect it from the Connectors button.', forbidden: 'That page is not shared with MyAvatar in Notion.', failed: 'Notion did not answer. Try again.', note: 'Nothing is saved yet.' },
  ru: { head: 'Черновик страницы Notion', save: 'Сохранить в Notion', saving: 'Сохраняем…', saved: 'Сохранено.', open: 'Открыть', not_connected: 'Notion не подключён. Подключите его кнопкой коннекторов.', forbidden: 'Эта страница не открыта для MyAvatar в Notion.', failed: 'Notion не ответил. Попробуйте ещё раз.', note: 'Пока ничего не сохранено.' },
} as const;

export function NotionDraftCard({ draft, locale }: { draft: NotionDraft; locale: string }) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const t = T[lang];
  const [state, setState] = useState<{ k: 'idle' } | { k: 'saving' } | { k: 'saved'; url: string | null } | { k: 'error'; msg: string }>({ k: 'idle' });
  const save = async () => {
    if (state.k === 'saving' || state.k === 'saved') return;
    setState({ k: 'saving' });
    try {
      const r = await fetch('/api/connectors/notion/pages', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const body = (await r.json().catch(() => null)) as { url?: string | null; error?: string } | null;
      if (r.ok) setState({ k: 'saved', url: body?.url ?? null });
      else setState({ k: 'error', msg: body?.error === 'not_connected' ? t.not_connected : r.status === 403 ? t.forbidden : t.failed });
    } catch {
      setState({ k: 'error', msg: t.failed });
    }
  };
  return (
    <section data-testid="notion-draft" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>{t.head}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{draft.title}</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', marginTop: 6, opacity: 0.85 }}>{draft.text}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
        {state.k === 'saved' ? (
          <>
            <span role="status">{t.saved}</span>
            {state.url && /^https:\/\/(www\.)?notion\.so\//.test(state.url) && <a href={state.url} target="_blank" rel="noopener noreferrer">{t.open}</a>}
          </>
        ) : (
          <button type="button" onClick={() => void save()} disabled={state.k === 'saving'} data-testid="notion-draft-save" style={{ minHeight: 44, padding: '0 14px', borderRadius: 12 }}>
            {state.k === 'saving' ? t.saving : t.save}
          </button>
        )}
        {state.k === 'idle' && <span style={{ fontSize: 12, opacity: 0.6 }}>{t.note}</span>}
        {state.k === 'error' && <span role="alert" style={{ fontSize: 12.5 }}>{state.msg}</span>}
      </div>
    </section>
  );
}
