import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see apps/api/.env.example)'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  AI_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  AI_MODEL: z.string().default('claude-haiku-5-5'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OCR_LANGS: z.string().default('eng'),
  STORAGE_DIR: z.string().default('./storage'),
  WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  SCHEDULER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  // Email: "console" prints emails to the API terminal (and saves them to STORAGE_DIR/outbox);
  // "smtp" sends real email (e.g. Gmail with an App Password).
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('LifeLoop <no-reply@lifeloop.local>'),
  APP_URL: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validates environment once at boot; fails fast with a readable message. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.AI_PROVIDER === 'anthropic' && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
  }
  if (parsed.data.EMAIL_PROVIDER === 'smtp' && (!parsed.data.SMTP_HOST || !parsed.data.SMTP_USER || !parsed.data.SMTP_PASS)) {
    throw new Error('EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_USER and SMTP_PASS');
  }
  cached = parsed.data;
  return cached;
}
