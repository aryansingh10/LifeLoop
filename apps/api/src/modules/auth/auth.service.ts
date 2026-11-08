import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuidv7 } from '../../common/ids.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { users, type UserRow } from '../../database/schema.js';

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(320),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  displayName: z.string().trim().min(1, 'Name is required').max(100),
  ageConfirmed: z.literal(true, { message: 'You must be 18 or older to use LifeLoop' }),
});
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

// argon2id with OWASP-recommended memory cost.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
// Used to equalize timing when the email does not exist.
const DUMMY_HASH = hash('lifeloop-timing-equalizer', ARGON);

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? 'Invalid input');
  return r.data;
}

@Injectable()
export class AuthService {
  constructor(@InjectDb() private readonly db: DB) {}

  async register(input: z.infer<typeof RegisterSchema>): Promise<UserRow> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) throw new ConflictException('An account with this email already exists');
    const id = uuidv7();
    await this.db.insert(users).values({
      id,
      email: input.email,
      passwordHash: await hash(input.password, ARGON),
      displayName: input.displayName,
    });
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async login(input: z.infer<typeof LoginSchema>): Promise<UserRow> {
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const ok = user?.passwordHash ? await verify(user.passwordHash, input.password) : (await verify(await DUMMY_HASH, input.password), false);
    if (!user || !ok) throw new UnauthorizedException('Incorrect email or password');
    return user;
  }
}
