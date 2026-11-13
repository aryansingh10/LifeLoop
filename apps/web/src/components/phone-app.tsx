'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { rest } from '@/lib/api';
import {
  canPromptInstall,
  currentPushSubscription,
  disablePush,
  enablePush,
  isInstalled,
  onInstallAvailabilityChange,
  promptInstall,
  pushSupported,
  showLocalTestNotification,
} from '@/lib/pwa';
import { ErrorNote, Spinner } from './ui';

/** Settings section: install LifeLoop on the phone and turn on reminder notifications for this device. */
export function PhoneAppSection() {
  const qc = useQueryClient();
  const [installed, setInstalled] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [supported, setSupported] = useState(true);
  const [thisDevice, setThisDevice] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    setInstalled(isInstalled());
    setInstallable(canPromptInstall());
    setSupported(pushSupported());
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    currentPushSubscription()
      .then((s) => setThisDevice(Boolean(s)))
      .catch(() => setThisDevice(false));
    return onInstallAvailabilityChange(() => {
      setInstallable(canPromptInstall());
      setInstalled(isInstalled());
    });
  }, []);

  const status = useQuery({ queryKey: ['push-status'], queryFn: () => rest<{ enabled: boolean; devices: number }>('/api/push/status') });

  const toggle = useMutation({
    mutationFn: async (on: boolean) => (on ? enablePush() : disablePush()),
    onSettled: async () => {
      setThisDevice(Boolean(await currentPushSubscription().catch(() => null)));
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
      qc.invalidateQueries({ queryKey: ['push-status'] });
    },
  });
  const test = useMutation({ mutationFn: () => rest<{ delivered: number }>('/api/push/test', { method: 'POST' }) });
  const local = useMutation({ mutationFn: showLocalTestNotification });
  const install = useMutation({ mutationFn: promptInstall, onSettled: () => setInstalled(isInstalled()) });

  const serverReady = status.data?.enabled ?? true;
  const others = Math.max(0, (status.data?.devices ?? 0) - (thisDevice ? 1 : 0));

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Phone app</h2>
        <p className="text-sm text-stone-500">Install LifeLoop on your phone to share screenshots and voice notes straight from WhatsApp or Gallery, and get reminders as notifications.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Install</p>
        {installed ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">LifeLoop is installed on this device.</p>
        ) : installable ? (
          <button className="btn-primary" disabled={install.isPending} onClick={() => install.mutate()}>
            {install.isPending && <Spinner />} Install LifeLoop
          </button>
        ) : (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            On Android, open this page in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
            After installing, LifeLoop appears in the Share menu of other apps.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
        <p className="text-sm font-medium">2. Notifications on this device</p>
        {!serverReady ? (
          <p className="text-sm text-stone-500">Phone notifications are not set up on the server yet (VAPID keys missing in apps/api/.env).</p>
        ) : !supported ? (
          <p className="text-sm text-stone-500">This browser can&apos;t show notifications. On Android, use Chrome; you&apos;ll still get in-app and email reminders.</p>
        ) : permission === 'denied' ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Notifications are blocked for LifeLoop. Allow them in your phone&apos;s Settings → Apps → LifeLoop (or Chrome) → Notifications, then come back here.
          </p>
        ) : thisDevice === null ? (
          <Spinner />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {thisDevice ? (
              <>
                <span className="text-sm text-emerald-700 dark:text-emerald-300">On for this device.</span>
                <button className="btn-secondary" disabled={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending && <Spinner />} Send a test
                </button>
                <button className="btn-secondary" disabled={local.isPending} onClick={() => local.mutate()}>
                  Test on this device only
                </button>
                <button className="btn-ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(false)}>
                  Turn off
                </button>
              </>
            ) : (
              <button className="btn-primary" disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>
                {toggle.isPending && <Spinner />} Turn on notifications
              </button>
            )}
          </div>
        )}
        {test.data && (
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {test.data.delivered > 0 ? 'Sent. It should appear in a few seconds.' : "Couldn't deliver to any device. Try turning notifications off and on again."}
          </p>
        )}
        {(test.data?.delivered ?? 0) > 0 || local.isSuccess ? (
          <details className="text-xs text-stone-500">
            <summary className="cursor-pointer">Nothing popped up?</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Check the notification panel (Windows: Win+N; Android: swipe down). It may have arrived silently.</li>
              <li>Turn off Do not disturb / Focus.</li>
              <li>Windows: Settings → System → Notifications → make sure Google Chrome (and LifeLoop) are On.</li>
              <li>Android: Settings → Apps → LifeLoop (or Chrome) → Notifications → On.</li>
              <li>If &quot;Test on this device only&quot; works but &quot;Send a test&quot; doesn&apos;t, keep Chrome running in the background and try again.</li>
            </ul>
          </details>
        ) : null}
        {others > 0 && <p className="text-xs text-stone-500">Also on for {others} other device{others === 1 ? '' : 's'}.</p>}
        <ErrorNote error={toggle.error ?? test.error ?? local.error ?? install.error} />
      </div>
    </section>
  );
}
