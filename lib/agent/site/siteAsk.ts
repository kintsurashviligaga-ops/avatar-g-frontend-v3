/**
 * lib/agent/site/siteAsk.ts — asks to act on myavatar.ge itself („დააკლიკე ბიბლიოთეკას", „შეავსე პარამეტრები",
 * „გადმოწერე ბოლო ვიდეო", "open my library here"). GG 2026-11-07 09:36Z. Pure: no I/O.
 *
 * An ask about another site (an address, youtube…) is the cloud browser's (lib/agent/browser/openSiteAsk), so it is never
 * taken here. An ask counts when it names an on-screen action AND points at this site: its name, „here / this page", or
 * one of its places (library, settings, balance…). A plain question is never one.
 */

const ACT = /(?:დააკლიკ|დააჭირ|დაკლიკ|შეავს|მოამზად|გაასწორ|გამოიყენ|ჩაწერ|გადმოწერ|ჩამოტვირთ|გადადი|გადამიყვან|გახსენი|გამიხსენი|აირჩი|მონიშნ|შეცვალ|დააყენ|ჩართ|გამორთ|მოძებნ|ჩამოსქროლ|(?:^|[^a-z])(?:click|tap|press|fill|prepare|fix|use|type|write|download|open|go\s+to|select|choose|change|set|turn\s+(?:on|off)|search|scroll)(?![a-z])|нажми|кликни|заполни|подготовь|исправь|используй|напиши|скачай|открой|перейди|выбери|измени|включи|выключи|найди)/iu;

const HERE = /(?:myavatar|მაიავატარ|ამ\s+(?:საიტ|გვერდ|ეკრან)|ჩვენს\s+საიტ|საიტზე|გვერდზე|ეკრანზე|აქ(?:ვე)?\b|ბიბლიოთეკ|პარამეტრ|ანგარიშ|ბალანს|კრედიტ|სტუდი|ფასებ|მეხსიერებ|სამუშაო\s+სივრც|ღილაკ|მენიუ|ველ(?:ი|ში|ს)|ჩატ|this\s+(?:site|page|screen)|on\s+(?:the\s+)?(?:site|page|screen)|\bhere\b|my\s+(?:library|settings|account|balance|credits)|\blibrary\b|\bsettings\b|\bpricing\b|\bworkspace\b|этот\s+сайт|на\s+сайте|на\s+странице|здесь|библиотек|настройк|баланс)/iu;

/** Another site named: that is the cloud browser's job. myavatar.ge itself is not another site. */
const ELSEWHERE = /(?:https?:\/\/(?!(?:www\.)?myavatar\.ge)|(?<!myavatar)\.(?:com|org|net|io|ai|dev|app|gov|edu|info|co|uk|de|ru|tv|me)\b|(?<!myavatar)\.ge\b|youtube|იუთუბ|იუტუბ|google|გუგლ|wikipedia|ვიკიპედი|facebook|ფეისბუქ|instagram|ინსტაგრამ|tiktok|ტიკტოკ|github|reddit|linkedin)/iu;

export function siteAsk(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 600) return false;
  if (ELSEWHERE.test(t)) return false;
  return ACT.test(t) && HERE.test(t);
}
