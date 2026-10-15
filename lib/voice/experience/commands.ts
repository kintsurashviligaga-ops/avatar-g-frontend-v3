import { selectPersonality, validateVoicePreferences, type VoicePreferences } from './settings';
/** Whole-utterance style commands only. Media project commands pass unchanged to the existing registry. */
export function voiceStyleCommand(text: string, current: VoicePreferences): VoicePreferences | null {
  const s = text.trim().replace(/[.!?]+$/, '').toLowerCase();
  if (/^(მოკლედ მითხარი|keep it brief|short answers|говори кратко)$/.test(s)) return { ...current, responseLength: 'brief' };
  if (/^(დეტალურად ამიხსენი|explain in detail|объясни подробно)$/.test(s)) return { ...current, responseLength: 'detailed' };
  if (/^(შეანელე საუბარი|speak slower|говори медленнее)$/.test(s)) return { ...current, pace: 'slow' };
  if (/^(იუმორი გამორთე|turn off humor|выключи юмор)$/.test(s)) return { ...current, humor: 'off', sarcasm: 'off' };
  if (/^(ახლა უფრო სარკასტულად მიპასუხე|be sarcastic|отвечай саркастично)$/.test(s)) return selectPersonality(current, 'sarcastic');
  if (/^(speak english|ინგლისურად ისაუბრე|говори по-английски)$/.test(s)) return validateVoicePreferences({ ...current, language: 'en' });
  if (/^(speak georgian|ქართულად ისაუბრე|говори по-грузински)$/.test(s)) return validateVoicePreferences({ ...current, language: 'ka' });
  if (/^(speak russian|რუსულად ისაუბრე|говори по-русски)$/.test(s)) return validateVoicePreferences({ ...current, language: 'ru' });
  return null;
}
