import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../../common/hash.js';
import { uuidv7 } from '../../common/ids.js';
import { env } from '../../config/env.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { authTokens, users } from '../../database/schema.js';
import { EmailService, escapeHtml } from '../email/email.service.js';

const VERIFY_TTL_MS = 24 * 3600 * 1000;

/**
 * Email verification with single-use links. The raw token only ever exists in the email;
 * the database stores its SHA-256 hash, so a database leak cannot be used to verify accounts.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger('EmailVerification');

  constructor(
    @InjectDb() private readonly db: DB,
    private readonly email: EmailService,
  ) {}

  /** Creates a fresh link (older unused links stop working) and emails it. */
  async send(userId: string): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u || u.emailVerifiedAt) return;
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (tx) => {
      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, 'VERIFY_EMAIL'), isNull(authTokens.usedAt)));
      await tx.insert(authTokens).values({
        id: uuidv7(),
        userId,
        purpose: 'VERIFY_EMAIL',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      });
    });
    const link = `${env().APP_URL}/verify-email?token=${token}`;
    try {
      await this.email.send({
        to: u.email,
        subject: 'Verify your email for LifeLoop',
        text: `Hi ${u.displayName},\n\nPlease confirm this is your email address:\n${link}\n\nThe link works once and expires in 24 hours. If you didn't create a LifeLoop account, you can ignore this email.`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#1c1917">
<p style="font-weight:600;color:#1a7a68;font-size:18px">LifeLoop</p>
<p>Hi ${escapeHtml(u.displayName)},</p><p>Please confirm this is your email address.</p>
<p><a href="${link}" style="display:inline-block;background:#1a7a68;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Verify my email</a></p>
<p style="font-size:12px;color:#78716c">The link works once and expires in 24 hours. If you didn't create a LifeLoop account, you can ignore this email.</p></div>`,
      });
    } catch (err) {
      // Registration still succeeds; the user can press "Resend" later.
      this.logger.warn(`verification email to user ${userId} failed: ${(err as Error).message}`);
    }
  }

  /** Consumes a link. Returns the user id on success, null if invalid, used or expired. */
  async verify(token: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, sha256(token)),
            eq(authTokens.purpose, 'VERIFY_EMAIL'),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .for('update');
      if (!row) return null;
      await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
      return row.userId;
    });
  }
}
