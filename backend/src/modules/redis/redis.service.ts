import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import { REDIS_PUB_CLIENT, REDIS_SUB_CLIENT } from './redis.constants';

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private messageHandler?: (channel: string, message: string) => void;

  constructor(
    @Inject(REDIS_PUB_CLIENT)
    private readonly pubClient: {
      publish: (channel: string, message: string) => Promise<number>;
      quit: () => Promise<void>;
    },
    @Inject(REDIS_SUB_CLIENT)
    private readonly subClient: {
      subscribe: (channel: string) => Promise<void>;
      unsubscribe: () => Promise<void>;
      on: (event: string, handler: (...args: any[]) => void) => void;
      off: (event: string, handler: (...args: any[]) => void) => void;
      quit: () => Promise<void>;
    },
  ) {}

  async publish(channel: string, data: any): Promise<void> {
    await this.pubClient.publish(channel, JSON.stringify(data));
  }

  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => void> {
    this.messageHandler = (receivedChannel: string, message: string) => {
      if (receivedChannel === channel) {
        handler(message);
      }
    };

    this.subClient.on('message', this.messageHandler);
    await this.subClient.subscribe(channel);

    return () => {
      if (this.messageHandler) {
        this.subClient.off('message', this.messageHandler);
        this.messageHandler = undefined;
      }
    };
  }

  async unsubscribe(): Promise<void> {
    if (this.messageHandler) {
      this.subClient.off('message', this.messageHandler);
      this.messageHandler = undefined;
    }
    await this.subClient.unsubscribe();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.unsubscribe();
    } catch (err) {
      this.logger.warn('Error unsubscribing from Redis channels', err);
    }
    try {
      await this.subClient.quit();
    } catch (err) {
      this.logger.warn('Error quitting Redis subscriber client', err);
    }
    try {
      await this.pubClient.quit();
    } catch (err) {
      this.logger.warn('Error quitting Redis publisher client', err);
    }
  }
}
