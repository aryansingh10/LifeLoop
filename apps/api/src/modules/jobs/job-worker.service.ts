import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { and, asc, eq, lt, lte } from 'drizzle-orm';
import { hostname } from 'node:os';
import { env } from '../../config/env.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { jobs, type JobRow } from '../../database/schema.js';
import { JobHandlerRegistry, NonRetryableError } from './job-handlers.js';

const POLL_MS = 1000;
const LEASE_MS = 2 * 60 * 1000;
const MAX_CONCURRENCY = 3;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

/** Exponential backoff with +/-20% jitter, capped at 10 minutes. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp * (0.8 + random() * 0.4));
}

/**
 * In-process worker over the MySQL `jobs` table.
 * Claims with SELECT ... FOR UPDATE SKIP LOCKED so a second worker process could run safely later.
 */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);
  private readonly workerId = `${hostname()}-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private running = 0;
  private stopping = false;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    @InjectDb() private readonly db: DB,
    private readonly registry: JobHandlerRegistry,
  ) {}

  onApplicationBootstrap() {
    if (!env().WORKER_ENABLED) return;
    this.logger.log(`Job worker started (${this.workerId})`);
    this.schedule(0);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await Promise.race([Promise.allSettled([...this.inFlight]), new Promise((r) => setTimeout(r, 25_000))]);
  }

  private schedule(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick() {
    try {
      await this.recoverExpiredLeases();
      let claimedAny = false;
      while (!this.stopping && this.running < MAX_CONCURRENCY) {
        const job = await this.claimOne();
        if (!job) break;
        claimedAny = true;
        this.running++;
        const p: Promise<void> = this.execute(job).finally(() => {
          this.running--;
          this.inFlight.delete(p);
        });
        this.inFlight.add(p);
      }
      this.schedule(claimedAny ? 50 : POLL_MS);
    } catch (err) {
      this.logger.error(`Worker tick failed: ${(err as Error).message}`);
      this.schedule(POLL_MS * 5);
    }
  }

  private async recoverExpiredLeases() {
    await this.db
      .update(jobs)
      .set({ status: 'QUEUED', lockedBy: null, lockedUntil: null })
      .where(and(eq(jobs.status, 'RUNNING'), lt(jobs.lockedUntil, new Date())));
  }

  private async claimOne(): Promise<JobRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, 'QUEUED'), lte(jobs.runAt, new Date())))
        .orderBy(asc(jobs.runAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!job) return undefined;
      const attempts = job.attempts + 1;
      await tx
        .update(jobs)
        .set({ status: 'RUNNING', attempts, lockedBy: this.workerId, lockedUntil: new Date(Date.now() + LEASE_MS) })
        .where(eq(jobs.id, job.id));
      return { ...job, attempts };
    });
  }

  private async execute(job: JobRow) {
    const handler = this.registry.get(job.type);
    const started = Date.now();
    try {
      if (!handler) throw new NonRetryableError(`No handler registered for job type ${job.type}`);
      await handler.handle(job.payload, { jobId: job.id, attempt: job.attempts });
      await this.db
        .update(jobs)
        .set({ status: 'SUCCEEDED', lockedBy: null, lockedUntil: null, lastError: null })
        .where(eq(jobs.id, job.id));
      this.logger.log(`job ${job.type} ${job.id} succeeded in ${Date.now() - started}ms`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const dead = err instanceof NonRetryableError || job.attempts >= job.maxAttempts;
      await this.db
        .update(jobs)
        .set({
          status: dead ? 'DEAD' : 'QUEUED',
          runAt: dead ? job.runAt : new Date(Date.now() + backoffMs(job.attempts)),
          lockedBy: null,
          lockedUntil: null,
          lastError: err.message.slice(0, 2000),
        })
        .where(eq(jobs.id, job.id));
      this.logger.warn(`job ${job.type} ${job.id} attempt ${job.attempts} failed${dead ? ' (dead)' : ''}: ${err.message}`);
      if (dead && handler?.onDead) {
        await handler.onDead(job.payload, err).catch((hookErr: Error) => this.logger.error(hookErr.message));
      }
    }
  }
}
