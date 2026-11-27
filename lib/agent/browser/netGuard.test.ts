/** @jest-environment node */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NET_GUARD_JS, isPublicIp, netGuardChromiumArgs, v6Groups } from './netGuard';

const BLOCKED = [
  // IPv6: loopback, unspecified, unique-local, link-local, multicast, site-local
  '::1', '[::1]', '0:0:0:0:0:0:0:1', '::', 'fc00::1', 'fd00::1', 'fd12:3456:789a::1', 'fe80::1', 'fe80::1%eth0', 'febf::1',
  'fec0::1', 'ff02::1', 'ff05::2',
  // IPv4 hidden inside IPv6
  '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', '::ffff:192.168.1.1', '::127.0.0.1',
  '64:ff9b::a00:1', '64:ff9b::127.0.0.1', '2002:7f00:1::1', '2002:c0a8:101::1', '2001::1', '2001:0:4136:e378::1',
  // documentation / ORCHID / special
  '2001:db8::1', '2001:10::1', '2001:20::1', '3fff::1', '100::1',
  // IPv4 private / special
  '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
  '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1', '198.51.100.7', '203.0.113.9', '192.0.0.8',
  // not an address at all
  '', 'localhost', 'example.com', '1.2.3', '::1::2', 'gggg::1', '1:2:3:4:5:6:7:8:9', '999.1.1.1',
];
const PUBLIC = [
  '8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888',
  '2a00:1450:4001:82a::200e', '::ffff:8.8.8.8', '2400:cb00::1',
];

describe('isPublicIp', () => {
  it.each(BLOCKED)('refuses %s', (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(PUBLIC)('allows %s', (ip) => expect(isPublicIp(ip)).toBe(true));

  it('reads compressed, full and dotted IPv6 forms the same way', () => {
    expect(v6Groups('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(v6Groups('2001:db8::')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(v6Groups('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(v6Groups('1:2:3:4:5:6:7::')).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(v6Groups('example.com')).toBeNull();
  });
});

describe('the sandbox copy of the rules (NET_GUARD_JS)', () => {
  it('gives the same answer as isPublicIp for every address in the table', async () => {
    const all = [...BLOCKED, ...PUBLIC];
    const dir = await mkdtemp(join(tmpdir(), 'ng-'));
    try {
      await writeFile(join(dir, 'run.mjs'), `${NET_GUARD_JS}\nprocess.stdout.write(JSON.stringify(${JSON.stringify(all)}.map(globalThis.__isPublicIp)));\n`);
      const out = await new Promise<string>((res, rej) => execFile(process.execPath, ['run.mjs'], { cwd: dir, env: {} }, (e, so) => (e ? rej(e) : res(so))));
      expect(JSON.parse(out)).toEqual(all.map((ip) => isPublicIp(ip)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores the test hook unless the offline test sets PW_CORE too', () => {
    expect(NET_GUARD_JS).toContain("process.env.PW_CORE && process.env.PW_TEST_NET");
  });
});

describe('Chromium switches', () => {
  it('send everything through the guard: no bypass for loopback, no own DNS, no QUIC, no direct WebRTC UDP', () => {
    const a = netGuardChromiumArgs(4321);
    expect(a).toContain('--proxy-server=http://127.0.0.1:4321');
    expect(a).toContain('--proxy-bypass-list=<-loopback>');
    expect(a.some((x) => x.startsWith('--host-resolver-rules=MAP * ~NOTFOUND'))).toBe(true);
    expect(a).toContain('--disable-quic');
    expect(a).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  });
});
