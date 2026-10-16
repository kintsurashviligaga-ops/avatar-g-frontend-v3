'use client';
import { PERSONALITIES, selectPersonality, type Personality, type VoicePreferences } from '@/lib/voice/experience/settings';
import { useVoicePreferences } from './VoicePreferencesProvider';

export const VOICE_SETTINGS_LABEL = { ka: 'საუბრის ხმა და ხასიათი', en: 'Conversation voice and style', ru: 'Голос и стиль общения' };
const COPY = {
  ka: { personality: 'ხასიათი', voice: 'ხმა', pace: 'საუბრის ტემპი', responseLength: 'პასუხის სიგრძე', humor: 'იუმორი', sarcasm: 'სარკაზმი', expressiveness: 'გამომსახველობა', eagerness: 'პასუხამდე პაუზა', language: 'ენა', tone: 'ტონი', reset: 'ამ მოწყობილობაზე პარამეტრების წაშლა', note: 'ხმა და პაუზა შემდეგ ზარზე შეიცვლება. სტილი შემდეგ მოსმენის ეტაპზე გამოიყენება. ტემპი და გამომსახველობა მოდელის მითითებებია; ზუსტი ჟღერადობა ჯერ შესამოწმებელია.', saved: 'ამ ანგარიშისთვის, მხოლოდ ამ მოწყობილობაზე.', failed: 'პარამეტრები ვერ შეინახა; ცვლილება მხოლოდ აქ მოქმედებს.', signIn: 'შენახვისთვის შედით ანგარიშში.' },
  en: { personality: 'Personality', voice: 'Voice', pace: 'Speaking pace', responseLength: 'Response length', humor: 'Humor', sarcasm: 'Sarcasm', expressiveness: 'Expressiveness', eagerness: 'Pause before response', language: 'Language', tone: 'Tone', reset: 'Delete settings on this device', note: 'Voice and pause apply next call. Style updates at the next listening boundary. Pace and expression are model instructions; exact delivery still needs listening verification.', saved: 'For this account, on this device only.', failed: 'Could not save settings; changes apply only here.', signIn: 'Sign in to save preferences.' },
  ru: { personality: 'Характер', voice: 'Голос', pace: 'Темп речи', responseLength: 'Длина ответа', humor: 'Юмор', sarcasm: 'Сарказм', expressiveness: 'Выразительность', eagerness: 'Пауза перед ответом', language: 'Язык', tone: 'Тон', reset: 'Удалить настройки на устройстве', note: 'Голос и пауза изменятся в следующем звонке. Стиль — при следующем прослушивании. Темп и выразительность задаются инструкцией; звучание ещё нужно проверить.', saved: 'Для этого аккаунта, только на этом устройстве.', failed: 'Не удалось сохранить; изменения действуют только здесь.', signIn: 'Войдите для сохранения настроек.' },
};
const OPTIONS = {
  pace: ['slow','normal','brisk'], responseLength: ['brief','balanced','detailed'], humor: ['off','light','moderate'],
  sarcasm: ['off','light','moderate'], expressiveness: ['restrained','natural','expressive'],
  eagerness: ['eager','normal','patient'], language: ['auto','ka','en','ru'], tone: ['auto','gentle','serious','upbeat'],
} as const;
const WORDS: Record<string, [string,string,string]> = {
  slow:['ნელი','Slow','Медленно'],normal:['ჩვეულებრივი','Normal','Обычно'],brisk:['სწრაფი','Brisk','Быстро'],
  brief:['მოკლე','Brief','Кратко'],balanced:['საშუალო','Balanced','Умеренно'],detailed:['დეტალური','Detailed','Подробно'],
  off:['გამორთული','Off','Выкл.'],light:['მსუბუქი','Light','Лёгкий'],moderate:['ზომიერი','Moderate','Умеренный'],
  restrained:['თავშეკავებული','Restrained','Сдержанно'],natural:['ბუნებრივი','Natural','Естественно'],expressive:['გამომსახველი','Expressive','Выразительно'],
  eager:['მოკლე პაუზა','Short pause','Короткая пауза'],patient:['გრძელი პაუზა','Long pause','Длинная пауза'],
  auto:['ავტომატური','Automatic','Автоматически'],ka:['ქართული','Georgian','Грузинский'],en:['ინგლისური','English','Английский'],ru:['რუსული','Russian','Русский'],
  gentle:['რბილი','Gentle','Мягко'],serious:['სერიოზული','Serious','Серьёзно'],upbeat:['ხალისიანი','Upbeat','Бодро'],
};
export function VoiceSettingsPanel({ userId, locale = 'ka' }: { userId?: string | null; locale?: 'ka'|'en'|'ru' }) {
  const { preferences: p, update, reset, saved } = useVoicePreferences(userId);
  const t = COPY[locale], ix = locale === 'ka' ? 0 : locale === 'en' ? 1 : 2;
  const change = (key: keyof VoicePreferences, value: string) => update({ ...p, [key]: value });
  const field = 'min-h-[44px] w-full rounded-lg border border-white/15 bg-black p-2 text-base text-white';
  return <section aria-label={VOICE_SETTINGS_LABEL[locale]} className="space-y-3 bg-black p-4 text-white">
    <p className="text-sm text-slate-300">{t.note}</p>
    <fieldset disabled={!userId} className="grid gap-3 sm:grid-cols-2">
      <label>{t.personality}<select className={field} value={p.personality} onChange={e => update(selectPersonality(p, e.target.value as Personality))}>
        {Object.entries(PERSONALITIES).map(([id,v]) => <option key={id} value={id}>{v[locale]}</option>)}
      </select></label>
      <label>{t.voice}<select className={field} value={p.voice} onChange={e => change('voice',e.target.value)}>
        {/* These two voices already exist in the product's Georgian-verified catalogue; no silent substitution. */}
        <option>Aoede</option><option>Charon</option>
      </select></label>
      {Object.entries(OPTIONS).map(([key,values]) => <label key={key}>{t[key as keyof typeof OPTIONS]}<select className={field}
        disabled={key === 'sarcasm' && p.personality !== 'sarcastic'}
        value={p[key as keyof typeof OPTIONS]} onChange={e => change(key as keyof VoicePreferences,e.target.value)}>
        {values.map(v => <option key={v} value={v}>{WORDS[v]?.[ix] ?? v}</option>)}
      </select></label>)}
    </fieldset>
    <p role="status" className="text-sm text-slate-300">{!userId ? t.signIn : saved ? t.saved : t.failed}</p>
    <button type="button" disabled={!userId} className="min-h-[44px] rounded-lg border border-blue-400 px-3 text-blue-300" onClick={reset}>{t.reset}</button>
  </section>;
}
