/** Browser-side helpers for the installable app: service worker, push subscription, shared content. */
import { rest } from './api';

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  listenForInstallPrompt();
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
}

// ------------------------------------------------------------------ "Install app" (Android Chrome)

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstall: InstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
let listening = false;

function listenForInstallPrompt() {
  if (listening) return;
  listening = true;
  // Chrome fires this once, early; keep it so an "Install" button can use it later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installListeners.forEach((fn) => fn());
  });
}

export const canPromptInstall = () => deferredInstall !== null;

export function onInstallAvailabilityChange(fn: () => void): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

/** Shows the browser's own install dialog. Returns true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  const evt = deferredInstall;
  if (!evt) return false;
  deferredInstall = null;
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  installListeners.forEach((fn) => fn());
  return outcome === 'accepted';
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isInstalled = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Asks for permission, subscribes this device and registers it with the API. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  const { enabled, publicKey } = await rest<{ enabled: boolean; publicKey: string | null }>('/api/push/public-key');
  if (!enabled || !publicKey) throw new Error('Phone notifications are not set up on the server yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await rest('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
}

/**
 * Shows a notification straight from this device's service worker, without the server or Google's push service.
 * If this one doesn't appear, the problem is the browser/OS notification settings, not LifeLoop's push delivery.
 */
export async function showLocalTestNotification(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  if (Notification.permission !== 'granted') throw new Error('Notifications are not allowed for LifeLoop in this browser.');
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('LifeLoop test (this device)', {
    body: 'If you can see this, your device shows LifeLoop notifications.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: `local-test-${Date.now()}`,
    data: { url: '/settings' },
  });
}

export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await rest('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  await sub.unsubscribe();
}

// ------------------------------------------------------------------ shared content (from the share sheet)

const SHARE_CACHE = 'lifeloop-share';

export interface SharedContent {
  text: string;
  file: File | null;
}

const SHARE_TTL_MS = 30 * 60 * 1000;

/** True when something was shared into the app recently and hasn't been opened yet (e.g. the user had to log in first). */
export async function hasPendingShare(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const cache = await caches.open(SHARE_CACHE);
  const res = await cache.match('/__share/meta');
  if (!res) return false;
  const { receivedAt } = (await res.json().catch(() => ({}))) as { receivedAt?: number };
  if (typeof receivedAt === 'number' && Date.now() - receivedAt < SHARE_TTL_MS) return true;
  for (const key of await cache.keys()) await cache.delete(key); // stale: don't keep it on the device
  return false;
}

/** Reads what was shared into the app and removes it from the device. */
export async function takeSharedContent(): Promise<SharedContent | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match('/__share/meta');
  if (!metaRes) return null;
  const meta = (await metaRes.json()) as { title: string; text: string; url: string; file: { name: string; type: string } | null };
  let file: File | null = null;
  if (meta.file) {
    const fileRes = await cache.match('/__share/file');
    if (fileRes) file = new File([await fileRes.blob()], meta.file.name, { type: meta.file.type || fileRes.headers.get('content-type') || '' });
  }
  for (const key of await cache.keys()) await cache.delete(key);
  // Apps fill title/text/url differently; keep each distinct piece once.
  const parts: string[] = [];
  for (const p of [meta.title, meta.text, meta.url].map((s) => s.trim()).filter(Boolean)) {
    if (!parts.some((q) => q.includes(p))) parts.push(p);
  }
  return { text: parts.join('\n'), file };
}

export const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(opus|ogg|m4a|mp3|aac|wav|amr)$/i.test(f.name);
export const isImageFile = (f: File) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
