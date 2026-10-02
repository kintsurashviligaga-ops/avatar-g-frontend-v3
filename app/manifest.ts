import type { MetadataRoute } from 'next';

/**
 * The ONE web app manifest, served at /manifest.webmanifest and linked by Next itself (no layout declares a
 * `manifest`). public/manifest.json — a second manifest the [locale] layout linked instead — is gone.
 *
 * "Add to Home Screen" on iOS and Android runs the studio standalone: no browser chrome, the true-black ground of the
 * app (app/globals.css --app-bg #000, the viewport's theme-color) under the launch screen.
 *
 * ⚠️ `start_url` stays /ka/dashboard (docs/DESIGN.md §9 lists it as a route invariant), and `id` pins the app's
 * identity to it: Chrome keys an installed PWA on `id`, which defaults to start_url — change start_url without an `id`
 * and every existing install becomes a different app that never receives this manifest again.
 *
 * Icons: scripts/brand/build-assets.mjs builds all three from the transparent rocket master.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/ka/dashboard',
    name: 'MyAvatar',
    short_name: 'MyAvatar',
    description: 'Georgian AI creative studio — chat, image, video, music, voice, avatar, interior, app builder in one window.',
    start_url: '/ka/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'ka',
    dir: 'ltr',
    categories: ['productivity', 'social', 'utilities', 'photo', 'entertainment'],
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Chat', short_name: 'Chat', url: '/ka/dashboard', description: 'Open the chat' },
      { name: 'Voice Lab', short_name: 'Voice', url: '/ka/voice-lab', description: 'Record + clone your voice' },
      { name: 'Memory', short_name: 'Memory', url: '/ka/memory', description: 'Manage your AI memories' },
    ],
  };
}
