#!/usr/bin/env node
/**
 * A TLS front for the Video Core E2E job: terminate HTTPS on <listenHost>:<listenPort> with the given certificate and
 * pass the plain bytes of every connection to <targetHost>:<targetPort> (the local Supabase API gateway).
 *
 * Why: the app takes storage URLs of ours only over https (lib/security/callerMedia), as Production serves them, so the
 * edit of Agent G's delivered video is refused on an http:// stack. The certificate comes from a CA the workflow makes
 * for this run only (its key is deleted at once); the app and the tests trust it through NODE_EXTRA_CA_CERTS, nothing
 * else does, and neither key leaves the runner.
 * usage: node tls-front.mjs <listenHost> <listenPort> <targetHost> <targetPort> <cert.pem> <key.pem>
 */
import { readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';

const [listenHost, listenPort, targetHost, targetPort, certFile, keyFile] = process.argv.slice(2);
if (!listenHost || !listenPort || !targetHost || !targetPort || !certFile || !keyFile) {
  console.error('usage: tls-front.mjs <listenHost> <listenPort> <targetHost> <targetPort> <cert.pem> <key.pem>');
  process.exit(64);
}
const server = tls.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, (client) => {
  const upstream = net.connect(Number(targetPort), targetHost);
  client.pipe(upstream).pipe(client);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error', close);
  upstream.on('error', close);
});
server.on('tlsClientError', (e) => console.error(`tls client error: ${e.code ?? e.message}`));
server.listen(Number(listenPort), listenHost, () => console.log(`tls ${listenHost}:${listenPort} → ${targetHost}:${targetPort}`));
