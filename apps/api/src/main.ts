import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const config = env(); // fail fast on bad configuration
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '200kb' });
  app.use(cookieParser());
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  await app.listen(config.PORT);
  new Logger('Bootstrap').log(`LifeLoop API on http://localhost:${config.PORT} (GraphQL at /graphql)`);
}

await bootstrap();
