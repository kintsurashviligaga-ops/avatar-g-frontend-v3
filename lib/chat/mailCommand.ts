/**
 * VECTOR 7 — "send this to my email" command detection.
 *
 * Pure + deterministic → unit-testable. Recognises the natural phrasings a user types to have Agent G email
 * the latest table/document to their account address, in Georgian (primary), English, and Russian. Kept
 * conservative: it must clearly be a SEND-TO-MAIL instruction, not merely a message that mentions email.
 */

/** True when `text` is an instruction to email the current message/table to the user. */
export function detectSendToEmailCommand(text: string): boolean {
  if (!text) return false;
  const raw = text.slice(0, 600);
  const lower = raw.toLowerCase();

  // Georgian: "გააგზავნე / გამომიგზავნე / მომწერე ... მეილზე / ელფოსტაზე / იმეილზე"
  const ka = /(გააგზავნე|გამომიგზავნე|გამიგზავნე|მომწერე)[\s\S]{0,60}(მეილ|ელ[-\s]?ფოსტ|იმეილ|email)/.test(raw);

  // English: "send this to my email", "email me this table", "mail me the document"
  const en = /\b(send|e-?mail|mail)\b[\s\S]{0,40}\b(e-?mail|inbox|mailbox)\b/.test(lower)
    || /\be-?mail\s+me\b/.test(lower)
    || /\bsend\b[\s\S]{0,20}\bto\s+my\s+e-?mail\b/.test(lower);

  // Russian: "отправь / пришли / вышли ... на почту / на емейл / на мейл"
  const ru = /(отправь|пришли|вышли|скинь)[\s\S]{0,40}(на\s+(почт|е-?мейл|email|мейл))/i.test(raw);

  return ka || en || ru;
}
