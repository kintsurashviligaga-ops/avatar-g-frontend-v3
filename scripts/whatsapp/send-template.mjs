#!/usr/bin/env node
/**
 * scripts/whatsapp/send-template.mjs — the Cloud API check from Meta's API Setup page, with OUR settings.
 *
 *   WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=… node scripts/whatsapp/send-template.mjs 995571333194 [template] [language]
 *
 * Sends the approved template (default `hello_world`, `en_US`) to the number, exactly as Meta's curl sample does, and prints
 * Meta's answer. The token is read from the environment and never printed. A message only arrives at a number that has
 * the WhatsApp app (and, while the app is in development, is on the recipients list in API Setup).
 *
 * On production the same check runs through POST /api/agent-g/whatsapp/send (admin only):
 *   curl -X POST https://myavatar.ge/api/agent-g/whatsapp/send -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" \
 *     -d '{"to":"995571333194","template":{"name":"hello_world","language":"en_US"}}'
 */
const [to = '', name = 'hello_world', language = 'en_US'] = process.argv.slice(2);
const token = (process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const version = /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') ? process.env.WHATSAPP_GRAPH_VERSION : 'v25.0';
const digits = to.replace(/\D/g, '');

if (!token || !phoneId || digits.length < 8) {
  console.error('usage: WHATSAPP_ACCESS_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=… node scripts/whatsapp/send-template.mjs <number> [template] [language]');
  process.exit(2);
}
if (/\s/.test(token)) {
  console.error('WHATSAPP_ACCESS_TOKEN contains whitespace — a token copied across lines; paste it as one unbroken string.');
  process.exit(2);
}

const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messaging_product: 'whatsapp', to: digits, type: 'template', template: { name, language: { code: language } } }),
});
const body = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));
process.exit(res.ok ? 0 : 1);
