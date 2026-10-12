#!/usr/bin/env node
/**
 * A plain TCP forwarder for the Video Core E2E job: listen on <listenHost>:<listenPort>, pass every connection to
 * <targetHost>:<targetPort>. Used only when Docker published the local Supabase API on 127.0.0.1 alone, so the stack's
 * reserved `.test` name (mapped onto an address bound to this runner's loopback interface) still reaches it.
 * usage: node forward.mjs <listenHost> <listenPort> <targetHost> <targetPort>
 */
import net from 'node:net';

const [listenHost, listenPort, targetHost, targetPort] = process.argv.slice(2);
if (!listenHost || !listenPort || !targetHost || !targetPort) {
  console.error('usage: forward.mjs <listenHost> <listenPort> <targetHost> <targetPort>');
  process.exit(64);
}
net.createServer((client) => {
  const upstream = net.connect(Number(targetPort), targetHost);
  client.pipe(upstream).pipe(client);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error', close);
  upstream.on('error', close);
}).listen(Number(listenPort), listenHost, () => console.log(`forwarding ${listenHost}:${listenPort} → ${targetHost}:${targetPort}`));
