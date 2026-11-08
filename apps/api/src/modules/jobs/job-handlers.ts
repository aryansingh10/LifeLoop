import { Injectable } from '@nestjs/common';

export class NonRetryableError extends Error {
  constructor(
    message: string,
    readonly code = 'NON_RETRYABLE',
  ) {
    super(message);
  }
}

export interface JobHandler {
  handle(payload: Record<string, unknown>, ctx: { jobId: string; attempt: number }): Promise<void>;
  /** Called once when the job is dead-lettered (retries exhausted or non-retryable). */
  onDead?(payload: Record<string, unknown>, error: Error): Promise<void>;
}

/** Registry so pipeline modules can register handlers without the Jobs module depending on them. */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  get(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }
}
