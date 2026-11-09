import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';
import { CurrentUserId } from '../../common/auth.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { users, type UserRow } from '../../database/schema.js';
import { env } from '../../config/env.js';
import { NotificationSettingsInput, UpdateProfileInput, User } from '../../graphql/models.js';
import { GoogleAuthError, GoogleService } from '../auth/google/google.service.js';

const toUser = (u: UserRow, googleEmail: string | null = null): User => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  timezone: u.timezone,
  defaultCurrency: u.defaultCurrency,
  emailNotifications: u.emailNotifications,
  digestEnabled: u.digestEnabled,
  digestHour: u.digestHour,
  emailDelivery: env().EMAIL_PROVIDER,
  googleEmail,
  hasPassword: Boolean(u.passwordHash),
  emailVerified: Boolean(u.emailVerifiedAt),
});

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Resolver(() => User)
export class UsersResolver {
  constructor(
    @InjectDb() private readonly db: DB,
    private readonly google: GoogleService,
  ) {}

  @Query(() => User)
  async me(@CurrentUserId() userId: string): Promise<User> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new NotFoundException('User not found');
    return toUser(u, (await this.google.isLinked(userId))?.email ?? null);
  }

  @Mutation(() => User)
  async updateProfile(@CurrentUserId() userId: string, @Args('input') input: UpdateProfileInput): Promise<User> {
    const patch: Partial<UserRow> = {};
    if (input.displayName != null) {
      if (!input.displayName.trim()) throw new BadRequestException('Name is required');
      patch.displayName = input.displayName.trim().slice(0, 100);
    }
    if (input.timezone != null) {
      if (!isValidTimeZone(input.timezone)) throw new BadRequestException('Unknown timezone');
      patch.timezone = input.timezone;
    }
    if (Object.keys(patch).length) await this.db.update(users).set(patch).where(eq(users.id, userId));
    return this.me(userId);
  }

  @Mutation(() => User)
  async updateNotificationSettings(@CurrentUserId() userId: string, @Args('input') input: NotificationSettingsInput): Promise<User> {
    const patch: Partial<UserRow> = {};
    if (input.emailNotifications != null) patch.emailNotifications = input.emailNotifications;
    if (input.digestEnabled != null) patch.digestEnabled = input.digestEnabled;
    if (input.digestHour != null) {
      if (!Number.isInteger(input.digestHour) || input.digestHour < 0 || input.digestHour > 23) {
        throw new BadRequestException('Digest hour must be between 0 and 23');
      }
      patch.digestHour = input.digestHour;
      patch.lastDigestDate = null; // let the new time take effect today
    }
    if (Object.keys(patch).length) await this.db.update(users).set(patch).where(eq(users.id, userId));
    return this.me(userId);
  }

  @Mutation(() => User, { description: 'Disconnect Google sign-in (only if a password is set)' })
  async disconnectGoogle(@CurrentUserId() userId: string): Promise<User> {
    try {
      await this.google.unlink(userId);
    } catch (err) {
      if (err instanceof GoogleAuthError) throw new BadRequestException(err.message);
      throw err;
    }
    return this.me(userId);
  }
}
