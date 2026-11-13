import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUserId, Public } from '../../common/auth.js';
import { PushService } from './push.service.js';

@Controller('api/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Public key the browser needs to subscribe; null when push isn't configured on this server. */
  @Public()
  @Get('public-key')
  publicKey() {
    return { enabled: this.push.enabled, publicKey: this.push.publicKey };
  }

  @Get('status')
  async status(@CurrentUserId() userId: string) {
    return { enabled: this.push.enabled, devices: await this.push.count(userId) };
  }

  @Post('subscriptions')
  @HttpCode(200)
  async subscribe(@CurrentUserId() userId: string, @Body() body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, @Req() req: Request) {
    await this.push.subscribe(userId, body, req.headers['user-agent']);
    return { ok: true };
  }

  @Delete('subscriptions')
  @HttpCode(200)
  async unsubscribe(@CurrentUserId() userId: string, @Body() body: { endpoint?: unknown }) {
    await this.push.unsubscribe(userId, body?.endpoint);
    return { ok: true };
  }

  @Post('test')
  @HttpCode(200)
  async test(@CurrentUserId() userId: string) {
    const delivered = await this.push.sendToUser(userId, {
      title: 'LifeLoop notifications are on',
      body: "You'll get reminders here when something needs a follow-up.",
      url: '/dashboard',
      tag: `test-${Date.now()}`, // unique, so every test pops up instead of silently replacing the previous one
    });
    return { delivered };
  }
}
