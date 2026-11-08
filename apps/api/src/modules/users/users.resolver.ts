import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';
import { CurrentUserId } from '../../common/auth.js';
import { InjectDb, type DB } from '../../database/database.module.js';
import { users, type UserRow } from '../../database/schema.js';
import { env } from '../../config/env.js';
import { NotificationSettingsInput, UpdateProfileInput, User } from '../../graphql/models.js';

const toUser = (u: UserRow): User => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  timezone: u.timezone,
  defaultCurrency: u.defaultCurrency,
  emailNotifications: u.emailNotifications,
  digestEnabled: u.digestEnabled,
  digestHour: u.digestHour,
  emailDelivery: env().EMAIL_PROVIDER,
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
  constructor(@InjectDb() private readonly db: DB) {}

  @Query(() => User)
  async me(@CurrentUserId() userId: string): Promise<User> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new NotFoundException('User not found');
    return toUser(u);
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
}
