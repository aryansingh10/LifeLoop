import { Global, Logger, Module } from '@nestjs/common';
import { env } from '../../config/env.js';
import { AI_PROVIDER, type AiProvider } from './ai-provider.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { MockAiProvider } from './mock.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      useFactory: (): AiProvider => {
        const e = env();
        const logger = new Logger('AiModule');
        if (e.AI_PROVIDER === 'anthropic' && e.ANTHROPIC_API_KEY) {
          logger.log(`AI provider: anthropic (${e.AI_MODEL})`);
          return new AnthropicProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL);
        }
        logger.log('AI provider: mock (rule-based, offline)');
        return new MockAiProvider();
      },
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
