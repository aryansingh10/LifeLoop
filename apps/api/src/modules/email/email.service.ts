import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Email delivery behind one interface.
 *  - console: logs the email and saves it as .html in STORAGE_DIR/outbox (no account needed)
 *  - smtp:    real delivery (Gmail App Password, Brevo, Resend SMTP, ...)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private transport?: Transporter;

  get mode(): 'console' | 'smtp' {
    return env().EMAIL_PROVIDER;
  }

  private smtp(): Transporter {
    if (!this.transport) {
      const e = env();
      this.transport = createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE,
        auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
      });
    }
    return this.transport;
  }

  async send(msg: EmailMessage): Promise<void> {
    if (this.mode === 'smtp') {
      await this.smtp().sendMail({ from: env().EMAIL_FROM, ...msg });
      this.logger.log(`sent "${msg.subject}" to ${maskEmail(msg.to)}`);
      return;
    }
    const dir = resolve(env().STORAGE_DIR, 'outbox');
    await mkdir(dir, { recursive: true });
    const file = resolve(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
    await writeFile(file, `<!-- To: ${msg.to} | Subject: ${msg.subject} -->\n${msg.html}`);
    this.logger.log(`[console email] To: ${msg.to} | ${msg.subject}\n${msg.text}\n(saved to ${file})`);
  }
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
