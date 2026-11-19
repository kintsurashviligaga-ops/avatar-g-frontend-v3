/**
 * components/studio/montage/smart/smartCopy.ts — the Smart Editor's words in Georgian, English and Russian. Georgian is
 * the first language and is never upper-cased (CSS uppercase would turn Mkhedruli into Mtavruli).
 */
import type { CaptionStyleId } from '@/lib/services/montage/smart/captions';
import type { FxKind } from '@/lib/services/montage/smart/timeline';

type Tri = { ka: string; en: string; ru: string };
const T = (ka: string, en: string, ru: string): Tri => ({ ka, en, ru });

export const SMART_COPY = {
  title: T('ჭკვიანი მონტაჟი', 'Smart edit', 'Умный монтаж'),
  done: T('მზადაა', 'Done', 'Готово'),
  tool: T('ჭკვიანი', 'Smart', 'Умный'),
  template: T('შაბლონი', 'Template', 'Шаблон'),
  captions: T('ავტო სუბტიტრები', 'Auto captions', 'Автосубтитры'),
  style: T('სტილი', 'Style', 'Стиль'),
  lang_ka: T('ქართული', 'Georgian', 'Грузинский'),
  lang_en: T('ინგლისური', 'English', 'Английский'),
  lang_ru: T('რუსული', 'Russian', 'Русский'),
  pos_top: T('ზემოთ', 'Top', 'Сверху'),
  pos_middle: T('შუაში', 'Middle', 'По центру'),
  pos_bottom: T('ქვემოთ', 'Bottom', 'Снизу'),
  kaPreview: T('ქართულის ამოცნობა Google-თან ჯერ საცდელ რეჟიმშია: ზოგი სიტყვა შეიძლება შეცდომით ამოვიდეს.',
    'Georgian recognition is still a preview at Google: some words may come out wrong.',
    'Распознавание грузинского у Google ещё в превью: отдельные слова могут быть с ошибкой.'),
  captionsRun: T('სუბტიტრების შექმნა · ✦{n} ({len} მეტყველება)', 'Make captions · ✦{n} ({len} of speech)', 'Создать субтитры · ✦{n} ({len} речи)'),
  captionsNoSpeech: T('მეტყველებიანი კლიპი არ არის', 'No clip with speech', 'Нет клипа с речью'),
  captionsDone: T('სუბტიტრები მზადაა · ჩამოიჭრა ✦{n}', 'Captions ready · ✦{n} charged', 'Субтитры готовы · списано ✦{n}'),
  captionsPartial: T('სუბტიტრები მზადაა, მაგრამ ერთი ნაწილი ვერ წავიკითხეთ · ჩამოიჭრა მხოლოდ წაკითხულის ✦{n}', 'Captions ready, but one piece could not be read · ✦{n} charged for what was read', 'Субтитры готовы, но один фрагмент не прочитан · списано ✦{n} за прочитанное'),
  captionsHave: T('სიტყვები შენახულია: ჭრა და გადალაგება ახალ ფასს არ ითხოვს.', 'Words are kept: trimming and reordering cost nothing more.', 'Слова сохранены: обрезка и перестановка ничего не стоят.'),
  pauses: T('პაუზების ამოჭრა', 'Remove pauses', 'Убрать паузы'),
  sens_low: T('რბილად', 'Gentle', 'Мягко'),
  sens_normal: T('ჩვეულებრივ', 'Normal', 'Обычно'),
  sens_tight: T('მჭიდროდ', 'Tight', 'Плотно'),
  fillers: T('„ეე“, „ამმ“ სიტყვებიც', 'Filler words too („um“, „uh“)', 'И слова-паразиты („э“, „мм“)'),
  fillersNeedCaptions: T('სიტყვა-პარაზიტებს ვიპოვით, როცა სუბტიტრები უკვე გაქვს.', 'Filler words are found once captions exist.', 'Слова-паразиты ищутся, когда субтитры уже есть.'),
  pausesFind: T('პაუზების პოვნა (უფასოა)', 'Find pauses (free)', 'Найти паузы (бесплатно)'),
  pausesFound: T('{n} პაუზა · −{sec}', '{n} pauses · −{sec}', '{n} пауз · −{sec}'),
  pausesApply: T('ამოჭრა', 'Cut them', 'Вырезать'),
  pausesDone: T('პაუზები ამოიჭრა. დაბრუნება: „უკან“.', 'Pauses cut. Undo brings them back.', 'Паузы вырезаны. «Отменить» вернёт их.'),
  noPauses: T('ზედმეტი პაუზა ვერ ვიპოვეთ.', 'No pauses worth cutting.', 'Лишних пауз не найдено.'),
  tooManyPieces: T('ზოგი კლიპი არ დავჭერით: მონტაჟი 12 ნაწილამდე იღებს.', 'Some clips were left whole: Montage takes up to 12 pieces.', 'Часть клипов не разрезана: монтаж принимает до 12 частей.'),
  beat: T('რიტმზე ჭრა', 'Cut to the beat', 'Резать в ритм'),
  beatRun: T('კლიპების ჭრა მუსიკის რიტმზე (უფასოა)', 'Auto-cut clips to the beat (free)', 'Нарезать клипы в ритм музыки (бесплатно)'),
  beatNeedsMusic: T('ჯერ მუსიკა დაამატე', 'Add music first', 'Сначала добавьте музыку'),
  beatDone: T('დაჭრილია რიტმზე · {bpm} BPM', 'Cut to the beat · {bpm} BPM', 'Нарезано в ритм · {bpm} BPM'),
  noBeat: T('მუსიკას მკაფიო რიტმი არ აქვს: ჭრები თანაბრადაა.', 'The song has no clear beat: the cuts are even.', 'У песни нет чёткого ритма: склейки равномерные.'),
  textAt: T('ტექსტი {t}-ზე', 'Text at {t}', 'Текст на {t}'),
  look_title: T('სათაური', 'Title', 'Заголовок'),
  look_subtitle: T('სუბტიტრი', 'Subtitle', 'Подпись'),
  look_label: T('იარლიყი', 'Label', 'Метка'),
  textPlaceholder: T('ტექსტი…', 'Text…', 'Текст…'),
  add: T('დამატება', 'Add', 'Добавить'),
  effectsAt: T('ეფექტი {t}-ზე', 'Effect at {t}', 'Эффект на {t}'),
  glitchCuts: T('გლიჩი ყველა ჭრაზე', 'Glitch on every cut', 'Глитч на каждой склейке'),
  tracksHint: T('ტექსტი და ეფექტები ტაიმლაინის ზედა ზოლებზეა: გადაათრიე, კიდე მოჭერი.', 'Text and effects sit on the top lanes of the timeline: drag to move, drag an edge to trim.', 'Текст и эффекты — на верхних дорожках: тяните, чтобы сдвинуть, тяните край, чтобы обрезать.'),
  noCredits: T('საჭიროა ✦{n}. შეავსე ბალანსი.', 'This needs ✦{n}. Top up to continue.', 'Нужно ✦{n}. Пополните баланс.'),
  notOpen: T('ჭკვიანი მონტაჟი შენთვის ჯერ ჩართული არ არის.', 'Smart edit is not on for you yet.', 'Умный монтаж для вас пока не включён.'),
  signIn: T('შედი ანგარიშზე.', 'Sign in to continue.', 'Войдите в аккаунт.'),
  failed: T('ახლა ვერ მოხერხდა. არაფერი ჩამოჭრილა.', 'That did not work right now. Nothing was charged.', 'Сейчас не получилось. Ничего не списано.'),
  agentTitle: T('Agent G-მ გააკეთა', 'Agent G did this', 'Agent G сделал'),
  agent_removeSilence_done: T('პაუზები ამოიჭრა: {n} · −{sec} წმ', 'Pauses cut: {n} · −{sec} s', 'Паузы вырезаны: {n} · −{sec} с'),
  agent_removeSilence_nothing: T('ზედმეტი პაუზა არ იყო', 'No pauses worth cutting', 'Лишних пауз не было'),
  agent_removeSilence_too_many_pieces: T('პაუზები ამოიჭრა, ზოგი კლიპი მთლიანი დარჩა (12 ნაწილის ზღვარი)', 'Pauses cut; some clips left whole (12-piece limit)', 'Паузы вырезаны; часть клипов целые (лимит 12 частей)'),
  agent_removeSilence_failed: T('პაუზები ვერ ვიპოვეთ. სცადე ქვემოთ', 'Could not find the pauses. Try below', 'Паузы не найдены. Попробуйте ниже'),
  agent_aiTrim_not_built: T('AI-ით „მოსაწყენის“ ძებნა (✦4/წთ) ჯერ არ არის: მოიჭრა მხოლოდ პაუზები', 'The AI watch pass (✦4/min) is not built yet: only pauses were cut', 'Поиск «скучного» с ИИ (✦4/мин) ещё не готов: вырезаны только паузы'),
  agent_beatSync_done: T('კლიპები რიტმზეა · {bpm} BPM', 'Clips on the beat · {bpm} BPM', 'Клипы в ритм · {bpm} BPM'),
  agent_beatSync_even: T('მუსიკას მკაფიო რიტმი არ აქვს: ჭრები თანაბრადაა', 'No clear beat: the cuts are even', 'Нет чёткого ритма: склейки равномерные'),
  agent_beatSync_needs_music: T('რიტმისთვის ჯერ მუსიკა დაამატე', 'Add music for the beat', 'Добавьте музыку для ритма'),
  agent_beatSync_failed: T('რიტმი ვერ წავიკითხეთ. სცადე ქვემოთ', 'Could not read the beat. Try below', 'Ритм не прочитан. Попробуйте ниже'),
  agent_template_done: T('შაბლონი: {v}', 'Template: {v}', 'Шаблон: {v}'),
  agent_aspect_done: T('ფორმატი: {v}', 'Format: {v}', 'Формат: {v}'),
  agent_transition_done: T('გადასვლა: {v}', 'Transition: {v}', 'Переход: {v}'),
  agent_captions_waits_for_tap: T('სუბტიტრები მზადაა ქვემოთ: ფასი ღილაკზეა, დააჭირე როცა გინდა', 'Captions are set up below: the price is on the button, tap it when you want them', 'Субтитры настроены ниже: цена на кнопке, нажмите, когда захотите'),
  laneText: T('ტექსტი', 'Text', 'Текст'),
  laneFx: T('ეფექტები', 'Effects', 'Эффекты'),
  remove: T('წაშლა', 'Remove', 'Удалить'),
} satisfies Record<string, Tri>;

export type SmartCopyKey = keyof typeof SMART_COPY;

export const STYLE_LABEL: Record<CaptionStyleId, Tri> = {
  'bold-word': T('სიტყვა-სიტყვა', 'Bold word by word', 'Слово за словом'),
  standard: T('სტანდარტული', 'Standard bottom', 'Стандартные'),
  karaoke: T('კარაოკე', 'Karaoke', 'Караоке'),
  boxed: T('ფონით', 'Boxed', 'С плашкой'),
  minimal: T('მინიმალური', 'Minimal', 'Минимальные'),
};

export const FX_LABEL: Record<FxKind, Tri> = {
  glitch: T('გლიჩი', 'Glitch', 'Глитч'),
  zoomPunch: T('ზუმ-დარტყმა', 'Zoom punch', 'Зум-удар'),
  shake: T('რყევა', 'Shake', 'Тряска'),
  flash: T('ციმციმი', 'Flash', 'Вспышка'),
};
