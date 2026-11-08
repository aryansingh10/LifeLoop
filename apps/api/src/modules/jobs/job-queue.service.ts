import { Injectable } from '@nestjs/common';
import { InjectDb, type DB, type DbOrTx } from '../../database/database.module.js';
import { jobs } from '../../database/schema.js';
import { uuidv7 } from '../../common/ids.js';

export interface EnqueueOptions {
  /** Pass the surrounding transaction so the job commits atomically with domain writes (outbox). */
  tx?: DbOrTx;
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
  userId?: string;
}

@Injectable()
export class JobQueue {
  constructor(@InjectDb() private readonly db: DB) {}

  async enqueue(type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<string> {
    const id = uuidv7();
    const insert = (opts.tx ?? this.db).insert(jobs).values({
      id,
      type,
      payload,
      status: 'QUEUED',
      maxAttempts: opts.maxAttempts ?? 3,
      runAt: opts.runAt ?? new Date(),
      dedupeKey: opts.dedupeKey ?? null,
      userId: opts.userId ?? null,
    });
    // A duplicate dedupe key means the job already exists: idempotent enqueue.
    if (opts.dedupeKey) {
      await insert.onDuplicateKeyUpdate({ set: { dedupeKey: opts.dedupeKey } });
    } else {
      await insert;
    }
    return id;
  }
}
