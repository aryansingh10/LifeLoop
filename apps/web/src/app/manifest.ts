import type { MetadataRoute } from 'next';

/**
 * Makes LifeLoop installable (Android: "Install app" / "Add to Home screen") and registers it as a
 * share target, so screenshots, voice notes and messages can be shared straight from WhatsApp, Gallery, Gmail…
 * The service worker (public/sw.js) receives the shared content at /share-target.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'LifeLoop',
    short_name: 'LifeLoop',
    description: 'Share it once. LifeLoop remembers what needs to happen next.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c0a09',
    theme_color: '#1a7a68',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Track something', short_name: 'Capture', url: '/dashboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Review suggestions', short_name: 'Review', url: '/suggestions', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'file', accept: ['image/png', 'image/jpeg', 'image/webp', 'audio/*', '.opus', '.ogg', '.m4a', '.mp3', '.aac', '.wav'] }],
      },
    },
  };
}
