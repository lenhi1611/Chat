import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { UserDirectory } from '@realtime-chat/api-chat';
import { consumeEvent, InflightTracker } from '@realtime-chat/api-messaging';
import { DOMAIN_EVENTS } from '@realtime-chat/contracts';

/**
 * Consumer of `chat.user-sync`: keeps chat_users in step with registrations
 * (event-carried state transfer). Idempotent (upsert), so redeliveries are
 * harmless; a lost event is covered by read-through.
 */
@Controller()
export class UserSyncController {
  private readonly logger = new Logger(UserSyncController.name);

  constructor(
    private readonly directory: UserDirectory,
    private readonly tracker: InflightTracker,
  ) {}

  @EventPattern(DOMAIN_EVENTS.userRegistered)
  registered(@Payload() data: unknown, @Ctx() rawContext: unknown) {
    // @EventPattern types the extra arguments as unknown.
    const context = rawContext as RmqContext;
    return consumeEvent(
      context,
      data,
      { tracker: this.tracker, logger: this.logger },
      async (event) => {
        if (event.type !== DOMAIN_EVENTS.userRegistered) return;
        const { userId, username, displayName } = event.payload;
        await this.directory.upsert({ id: userId, username, displayName });
        this.logger.log(
          `Synced user ${userId} [correlationId=${event.correlationId}]`,
        );
      },
    );
  }
}
