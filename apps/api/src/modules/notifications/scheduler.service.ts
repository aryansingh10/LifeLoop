import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env.js';
import { NotificationsService } from './notifications.service.js';

const TICK_MS = 60_000;

/**
 * Runs every minute: wake snoozed cases -> create due reminders -> email them -> morning digests.
 * Every step is idempotent (dedupe keys / claimed digest day), so a missed or repeated tick is harmless.
 * Single-instance prototype; with several API instances, guard with a DB lock or move to a job queue.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  onApplicationBootstrap() {
    if (!env().SCHEDULER_ENABLED) return;
    this.logger.log(`Reminder scheduler started (every ${TICK_MS / 1000}s, email: ${env().EMAIL_PROVIDER})`);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), 5_000); // first run shortly after boot
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: Date = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const woke = await this.notifications.wakeSnoozed(now);
      const created = await this.notifications.createDueReminders(now);
      const emailed = await this.notifications.emailPending(now);
      const digests = await this.notifications.sendDigests(now);
      if (woke || created || emailed || digests) {
        this.logger.log(`woke ${woke} snoozed, ${created} new reminder(s), ${emailed} email(s), ${digests} digest(s)`);
      }
    } catch (err) {
      this.logger.error(`tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
