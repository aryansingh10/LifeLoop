import { Global, Module } from '@nestjs/common';
import { JobHandlerRegistry } from './job-handlers.js';
import { JobQueue } from './job-queue.service.js';
import { JobWorker } from './job-worker.service.js';

@Global()
@Module({
  providers: [JobQueue, JobHandlerRegistry, JobWorker],
  exports: [JobQueue, JobHandlerRegistry],
})
export class JobsModule {}
