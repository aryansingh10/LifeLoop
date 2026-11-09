import { Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../../common/hash.js';
import { uuidv7 } from '../../common/ids.js';
import { env } from '../../config/env.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { authTokens, users } from '../../database/schema.js';
import { EmailService, escapeHtml } from '../email/email.service.js';
import { hashPassword } from './auth.service.js';

const RESET_TTL_MS = 30 * 60 * 1000;

function shell(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#1c1917">
<p style="font-weight:600;color:#1a7a68;font-size:18px">LifeLoop</p>${inner}</div>`;
}

/**
 * "Forgot password" for everyone, and "add a password" for Google-only accounts.
 * Single-use links, 30 minutes, only a hash stored. Setting a password signs out all other sessions.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    @InjectDb() private readonly db: DB,
    private readonly email: EmailService,
  ) {}

  /** Always completes silently, so the response never reveals whether an email is registered. */
  async request(emailAddress: string): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.email, emailAddress)).limit(1);
    if (!u) return;
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async (tx) => {
      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(authTokens.userId, u.id), eq(authTokens.purpose, 'RESET_PASSWORD'), isNull(authTokens.usedAt)));
      await tx.insert(authTokens).values({
        id: uuidv7(),
        userId: u.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
    });
    const link = `${env().APP_URL}/reset-password?token=${token}`;
    const hasPassword = Boolean(u.passwordHash);
    const action = hasPassword ? 'reset your password' : 'add a password to your account';
    try {
      await this.email.send({
        to: u.email,
        subject: hasPassword ? 'Reset your LifeLoop password' : 'Add a password to your LifeLoop account',
        text: `Hi ${u.displayName},\n\nUse this link to ${action}:\n${link}\n\nIt works once and expires in 30 minutes. If you didn't ask for this, ignore this email; nothing changes.${hasPassword ? '' : '\n\nYou can keep signing in with Google either way.'}`,
        html: shell(`<p>Hi ${escapeHtml(u.displayName)},</p><p>Use this link to ${action}.</p>
<p><a href="${link}" style="display:inline-block;background:#1a7a68;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${hasPassword ? 'Reset password' : 'Add a password'}</a></p>
<p style="font-size:12px;color:#78716c">It works once and expires in 30 minutes. If you didn't ask for this, ignore this email — nothing changes.${hasPassword ? '' : ' You can keep signing in with Google either way.'}</p>`),
      });
    } catch (err) {
      this.logger.warn(`reset email to user ${u.id} failed: ${(err as Error).message}`);
    }
  }

  /**
   * Sets the new password. Returns the user id, or null if the link is invalid/used/expired.
   * Also: marks the email verified (the link proved inbox ownership) and signs out every session.
   */
  async reset(token: string, newPassword: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const passwordHash = await hashPassword(newPassword);
    const userId = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.purpose, 'RESET_PASSWORD'), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
        .for('update');
      if (!row) return null;
      const now = new Date();
      await tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
      const [u] = await tx.select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, row.userId));
      await tx
        .update(users)
        .set({ passwordHash, sessionsValidAfter: now, ...(u?.verified ? {} : { emailVerifiedAt: now }) })
        .where(eq(users.id, row.userId));
      return row.userId;
    });
    if (userId) await this.notifyChanged(userId);
    return userId;
  }

  private async notifyChanged(userId: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) return;
    await this.email
      .send({
        to: u.email,
        subject: 'Your LifeLoop password was changed',
        text: `Hi ${u.displayName},\n\nThe password for your LifeLoop account was just set. All other devices were signed out.\n\nIf this wasn't you, use "Forgot password" at ${env().APP_URL}/forgot-password right away.`,
        html: shell(`<p>Hi ${escapeHtml(u.displayName)},</p><p>The password for your LifeLoop account was just set. All other devices were signed out.</p>
<p style="font-size:12px;color:#78716c">If this wasn't you, use <a href="${env().APP_URL}/forgot-password">Forgot password</a> right away.</p>`),
      })
      .catch((err: Error) => this.logger.warn(`password-changed notice failed: ${err.message}`));
  }
}
