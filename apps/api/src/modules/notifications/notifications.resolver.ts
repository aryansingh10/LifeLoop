import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUserId } from '../../common/auth.js';
import type { NotificationRow } from '../../database/schema.js';
import { Notification } from '../../graphql/models.js';
import { NotificationsService } from './notifications.service.js';

const toNotification = (n: NotificationRow): Notification => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  caseId: n.caseId,
  read: n.readAt != null,
  emailed: n.emailedAt != null,
  createdAt: n.createdAt,
});

@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(private readonly svc: NotificationsService) {}

  @Query(() => [Notification])
  async notifications(@CurrentUserId() userId: string, @Args('limit', { type: () => Int, defaultValue: 30 }) limit: number) {
    return (await this.svc.list(userId, limit)).map(toNotification);
  }

  @Query(() => Int)
  unreadNotificationCount(@CurrentUserId() userId: string) {
    return this.svc.unreadCount(userId);
  }

  @Mutation(() => Int, { description: 'Mark notifications read; omit ids to mark all read' })
  markNotificationsRead(@CurrentUserId() userId: string, @Args('ids', { type: () => [ID], nullable: true }) ids?: string[]) {
    return this.svc.markRead(userId, ids);
  }

  @Mutation(() => String, { description: 'Sends a test email to your own address' })
  sendTestEmail(@CurrentUserId() userId: string) {
    return this.svc.sendTestEmail(userId);
  }
}
