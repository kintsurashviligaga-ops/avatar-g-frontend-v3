#!/usr/bin/env node
/**
 * scripts/bog-oauth-check.mjs — "does Bank of Georgia accept this Client ID + Secret Key?", answered with ONE
 * OAuth token request. It creates no order, charges nothing and touches no database; BOG's token endpoint is the
 * same one our checkout calls first (lib/billing/bogClient), so a pass here means checkout's first step passes too.
 *
 *   node scripts/bog-oauth-check.mjs                 production (oauth2.bog.ge) — the OPAY pair from Business Manager
 *   BOG_ENV=sandbox node scripts/bog-oauth-check.mjs sandbox (oauth2-sandbox.bog.ge) — a sandbox pair
 *
 * The pair comes from BOG_CLIENT_ID / BOG_SECRET_KEY when both are set, otherwise it is asked for in the terminal
 * and the secret is typed blind — so it never lands in shell history, a chat or a log. The script prints the
 * verdict, BOG's HTTP status, BOG's answer with the secret scrubbed (never the token) and the client id's last four
 * characters, which the admin BOG card also shows, so the owner can tell which pair a deployment runs on.
 *
 * BOG_OAUTH_URL overrides the token URL (local tests only). Exit code: 0 accepted, 1 refused / no answer, 2 usage.
 */
import readline from 'node:readline';

const HOSTS = {
  production: 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',
  sandbox: 'https://oauth2-sandbox.bog.ge/auth/realms/bog/protocol/openid-connect/token',
};

const HINTS = {
  ok: 'BOG იღებს ამ Client ID + Secret Key-ს. ეს წყვილი შეიძლება ჩაიწეროს Vercel-ში (BOG_CLIENT_ID / BOG_SECRET_KEY).',
  credentials_refused:
    'BOG-მა წყვილი არ მიიღო. ხელახლა დააკოპირე ორივე Business Manager-იდან (ზედმეტი ჰარის გარეშე). ' +
    'თუ ეს Sandbox-ის წყვილია, გაუშვი BOG_ENV=sandbox-ით; თუ Production-ის — BOG_ENV-ის გარეშე.',
  forbidden: 'BOG-მა წყვილი იცნო, მაგრამ წვდომა არ მისცა: Online Payments API ამ მერჩანტზე ჯერ არ არის ჩართული — ჰკითხე ბანკს.',
  endpoint_not_found: 'Token-ის მისამართმა 404 დააბრუნა — BOG_OAUTH_URL არასწორია, ან BOG-მა მისამართი შეცვალა.',
  bog_error: 'BOG-მა სერვერის შეცდომა დააბრუნა. სცადე მოგვიანებით; თუ განმეორდა, აცნობე ბანკს.',
  no_answer: 'BOG-მა არ უპასუხა (ქსელი, DNS ან timeout). შეამოწმე ინტერნეტი და სცადე თავიდან.',
  malformed_answer: 'BOG-მა 2xx დააბრუნა access_token-ის გარეშე — აცნობე ბანკს ეს პასუხი.',
};

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo the prompt, swallow every keystroke.
      rl._writeToOutput = (chunk) => {
        if (chunk.includes(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const environment = (process.env.BOG_ENV || '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
const url = (process.env.BOG_OAUTH_URL || '').trim() || HOSTS[environment];

let id = (process.env.BOG_CLIENT_ID || '').trim();
let secret = (process.env.BOG_SECRET_KEY || '').trim();
if (!id || !secret) {
  if (!process.stdin.isTTY) {
    console.error('Set BOG_CLIENT_ID and BOG_SECRET_KEY, or run this in a terminal to type them in.');
    process.exit(2);
  }
  console.log(`BOG ${environment} — ჩასვი Business Manager-იდან (Secret Key ეკრანზე არ გამოჩნდება):`);
  id = id || (await ask('  OPAY Client ID: ', false));
  secret = secret || (await ask('  OPAY Secret Key: ', true));
}
if (!id || !secret) {
  console.error('Client ID and Secret Key are both required.');
  process.exit(2);
}

const scrub = (t) =>
  String(t)
    .split(secret)
    .join('[redacted]')
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[hidden]"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

const started = Date.now();
let verdict;
let status = 0;
let answer = null;
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  status = res.status;
  const text = await res.text().catch(() => '');
  if (res.ok) {
    let token;
    try {
      token = JSON.parse(text).access_token;
    } catch {
      token = undefined;
    }
    verdict = typeof token === 'string' && token ? 'ok' : 'malformed_answer';
    if (verdict !== 'ok') answer = scrub(text);
  } else {
    answer = text ? scrub(text) : null;
    verdict =
      status === 403 ? 'forbidden' : status === 404 ? 'endpoint_not_found' : status >= 500 ? 'bog_error' : 'credentials_refused';
  }
} catch {
  verdict = 'no_answer';
}

const mark = verdict === 'ok' ? '✓' : '✗';
console.log(`${mark} ${verdict} · HTTP ${status || '—'} · ${environment} · client …${id.slice(-4)} · ${Date.now() - started} ms`);
if (answer) console.log(`  BOG: ${answer}`);
console.log(`  ${HINTS[verdict]}`);
process.exit(verdict === 'ok' ? 0 : 1);
