import type { MetadataRoute } from 'next';

/**
 * PWA manifest for myavatar.ge.
 *
 * Enables "Add to Home Screen" on iOS and Android so the chat surface
 * runs as a standalone installable app — no browser chrome, full-screen
 * pure-black background that matches MyAvatarChat. iOS users see this
 * via Safari's Share → "Add to Home Screen"; Android users see a Chrome
 * install banner automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyAvatar.ge — AI Chat',
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
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Chat', short_name: 'Chat', url: '/ka/dashboard', description: 'Open the chat' },
      { name: 'Voice Lab', short_name: 'Voice', url: '/ka/voice-lab', description: 'Record + clone your voice' },
      { name: 'Memory', short_name: 'Memory', url: '/ka/memory', description: 'Manage your AI memories' },
    ],
  };
}
