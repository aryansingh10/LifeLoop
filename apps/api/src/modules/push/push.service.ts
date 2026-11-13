import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import { sha256 } from '../../common/hash.js';
import { uuidv7 } from '../../common/ids.js';
import { env } from '../../config/env.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { pushSubscriptions } from '../../database/schema.js';

/**
 * Push endpoints are URLs chosen by the browser. Because the server makes requests to them, only the
 * real browser push services are accepted (prevents the server being used to call arbitrary URLs).
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome / Android
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /\.notify\.windows\.com$/, // Edge (Windows)
  /^web\.push\.apple\.com$/, // Safari / iOS
  /\.push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the app to open when the notification is tapped, e.g. /cases/<id>. */
  url: string;
  tag?: string;
}

const MAX_FAILURES = 5;

@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private configured = false;

  get enabled(): boolean {
    return Boolean(env().VAPID_PUBLIC_KEY && env().VAPID_PRIVATE_KEY);
  }

  get publicKey(): string | null {
    return env().VAPID_PUBLIC_KEY ?? null;
  }

  private ensureConfigured() {
    if (this.configured || !this.enabled) return;
    const e = env();
    const subject = e.VAPID_SUBJECT ?? (e.SMTP_USER ? `mailto:${e.SMTP_USER}` : e.APP_URL);
    setVapidDetails(subject, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
    this.configured = true;
  }

  constructor(@InjectDb() private readonly db: DB) {}

  async subscribe(userId: string, input: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, userAgent?: string) {
    const endpoint = typeof input?.endpoint === 'string' ? input.endpoint : '';
    const p256dh = typeof input?.keys?.p256dh === 'string' ? input.keys.p256dh : '';
    const auth = typeof input?.keys?.auth === 'string' ? input.keys.auth : '';
    if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2000) throw new BadRequestException('Unsupported push endpoint');
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(auth)) throw new BadRequestException('Invalid push keys');
    const endpointHash = sha256(endpoint);
    // The same browser re-subscribing (or switching accounts) replaces the old row.
    await this.db
      .insert(pushSubscriptions)
      .values({ id: uuidv7(), userId, endpointHash, endpoint, p256dh, auth, userAgent: userAgent?.slice(0, 255) ?? null })
      .onDuplicateKeyUpdate({ set: { userId, p256dh, auth, failureCount: 0, userAgent: userAgent?.slice(0, 255) ?? null } });
  }

  async unsubscribe(userId: string, endpoint: unknown) {
    if (typeof endpoint !== 'string') return;
    await this.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpointHash, sha256(endpoint))));
  }

  async count(userId: string): Promise<number> {
    const rows = await this.db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    return rows.length;
  }

  /** Sends to every device of the user. Expired subscriptions are removed; failures never throw. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;
    this.ensureConfigured();
    const subs = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    let delivered = 0;
    for (const s of subs) {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'normal' });
        delivered++;
        await this.db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const status = err instanceof WebPushError ? err.statusCode : 0;
        if (status === 404 || status === 410) {
          await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); // unsubscribed / expired
        } else {
          this.logger.warn(`push to user ${userId} failed (${status || (err as Error).message})`);
          await this.db
            .update(pushSubscriptions)
            .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
            .where(eq(pushSubscriptions.id, s.id));
          if (s.failureCount + 1 >= MAX_FAILURES) await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }
    }
    return delivered;
  }
}
