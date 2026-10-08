/** @jest-environment node */
/**
 * The §51 search box, read from the source like the other ChatChrome / OmniStudio suites (both are thousands of lines
 * behind auth and dynamic imports). Pinned:
 *  · the sidebar's search finds services through the catalog (searchServices) and lists them above the chats;
 *  · a found service opens as the SERVICE: in the studio `omni:set-tool` carries { tool, service, surface: 'search' },
 *    elsewhere the catalog link (serviceHref) carries tool and mode;
 *  · the studio honours both: the event sets the service's mode and counts its own id, and `?tool=video&mode=musicvideo`
 *    opens Video in music-video mode (it used to open plain Video).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const chrome = readFileSync(join(__dirname, 'ChatChrome.tsx'), 'utf8');
const omni = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');

describe('the sidebar search', () => {
  it('finds services through the catalog and lists them above the chats', () => {
    expect(chrome).toContain('const serviceHits = useMemo(() => (convQuery.trim() ? searchServices(convQuery) : []), [convQuery]);');
    const results = chrome.indexOf('<ServiceSearchResults services={serviceHits}');
    const history = chrome.indexOf('{authed && onStudioHome && !historySynced && conversations.length === 0 ? (');
    expect(results).toBeGreaterThan(0);
    expect(results).toBeLessThan(history);
  });

  it('says "nothing found" only when neither a service nor a chat matched', () => {
    expect(chrome).toContain('serviceHits.length > 0 ? null : <p className="px-2.5 py-1 text-[12px] text-app-muted">{tNoMatch}</p>');
  });

  it('opens a found service as the service, in the studio and outside it', () => {
    const open = chrome.slice(chrome.indexOf('const openService = useCallback'), chrome.indexOf('const handleSelectConversation'));
    expect(open).toContain("new CustomEvent('omni:set-tool', { detail: { tool: s.tool, service: s.id, surface: 'search' } })");
    expect(open).toContain('const url = serviceHref(s.id, locale);');
    expect(open).toContain('if (!s.tool) return;');
  });
});

describe('the studio', () => {
  it('opens a searched service with its mode and counts it under its own id', () => {
    const handler = omni.slice(omni.indexOf('The sidebar SEARCH (§51)'), omni.indexOf("window.addEventListener('omni:set-tool', onSet);"));
    expect(handler).toContain("if (isToolId(d)) { selectTool(d, 'sidebar'); return; }");
    expect(handler).toContain("selectTool(o.tool, 'search', service?.id ?? null);");
    expect(handler).toContain('serviceModeQuery(service.id)?.mode');
    expect(handler).toContain("if (o.tool === 'video' && (m === 'musicvideo' || m === 'documentary')) setVideoMode(m);");
    // A service whose tool is not the one named is ignored, never opened on the wrong tool.
    expect(handler).toContain('if (service && service.tool !== o.tool) return;');
  });

  it('keeps the mode of a ?tool=video deep link', () => {
    expect(omni).toContain("const videoMode = tl === 'video' && (vm === 'musicvideo' || vm === 'documentary') ? vm : null;");
    expect(omni).toContain("selectTool(tl, 'deep-link', serviceForTool(tl, { videoMode }));");
    expect(omni).toContain("if (videoMode) { setVideoMode(videoMode); url.searchParams.delete('mode'); }");
  });
});
