import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { sql } from 'drizzle-orm';
import type { GraphQLFormattedError } from 'graphql';
import { AuthGuard, Public, SessionValidator, type GqlContext } from './common/auth.js';
import { env } from './config/env.js';
import { DatabaseModule, InjectDb, type DB } from './database/database.module.js';
import { CapturesResolver, CasesResolver, SuggestionsResolver } from './graphql/resolvers.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AttachmentsController } from './modules/attachments/attachments.controller.js';
import { AttachmentsService } from './modules/attachments/attachments.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { GoogleService } from './modules/auth/google/google.service.js';
import { EmailVerificationService } from './modules/auth/email-verification.service.js';
import { PasswordResetService } from './modules/auth/password-reset.service.js';
import { CapturesService } from './modules/captures/captures.service.js';
import { CasesService } from './modules/cases/cases.service.js';
import { ExtractionModule } from './modules/extraction/extraction.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { OcrService } from './modules/ocr/ocr.service.js';
import { TranscriptionService } from './modules/transcription/transcription.service.js';
import { ProcessingService } from './modules/processing/processing.service.js';
import { LocalDiskStorage } from './modules/storage/storage.service.js';
import { SuggestionsService } from './modules/suggestions/suggestions.service.js';
import { UsersResolver } from './modules/users/users.resolver.js';
import { EmailService } from './modules/email/email.service.js';
import { NotificationsResolver } from './modules/notifications/notifications.resolver.js';
import { NotificationsService } from './modules/notifications/notifications.service.js';
import { SchedulerService } from './modules/notifications/scheduler.service.js';
import { PushController } from './modules/push/push.controller.js';
import { PushService } from './modules/push/push.service.js';

@Controller()
class HealthController {
  constructor(@InjectDb() private readonly db: DB) {}

  @Public()
  @Get('health')
  async health() {
    await this.db.execute(sql`SELECT 1`);
    return { ok: true };
  }
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

/** Maps Nest HTTP exceptions to stable GraphQL error codes; hides internals in production. */
function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = (error as { originalError?: { status?: number; getStatus?: () => number } })?.originalError;
  const status = original?.getStatus?.() ?? original?.status;
  const code = (status && STATUS_CODES[status]) || (formatted.extensions?.code as string) || 'INTERNAL_SERVER_ERROR';
  const isInternal = code === 'INTERNAL_SERVER_ERROR';
  const message = isInternal && env().NODE_ENV === 'production' ? 'Something went wrong' : formatted.message;
  return { message, path: formatted.path, locations: formatted.locations, extensions: { code } };
}

@Module({
  imports: [
    DatabaseModule,
    JobsModule,
    AiModule,
    ExtractionModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      introspection: env().NODE_ENV !== 'production',
      csrfPrevention: true,
      context: ({ req, res }: GqlContext) => ({ req, res }),
      formatError,
    }),
  ],
  controllers: [HealthController, AuthController, AttachmentsController, PushController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    GoogleService,
    EmailVerificationService,
    PasswordResetService,
    SessionValidator,
    UsersResolver,
    LocalDiskStorage,
    AttachmentsService,
    CapturesService,
    CasesService,
    SuggestionsService,
    OcrService,
    TranscriptionService,
    ProcessingService,
    CapturesResolver,
    SuggestionsResolver,
    CasesResolver,
    EmailService,
    NotificationsService,
    NotificationsResolver,
    SchedulerService,
    PushService,
  ],
})
export class AppModule {}
