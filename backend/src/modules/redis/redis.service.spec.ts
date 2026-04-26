import { Test, TestingModule } from '@nestjs/testing';
import { RedisPubSubService } from './redis.service';
import { REDIS_PUB_CLIENT, REDIS_SUB_CLIENT } from './redis.constants';

describe('RedisPubSubService', () => {
  let service: RedisPubSubService;
  let pubClient: { publish: jest.Mock; quit: jest.Mock };
  let subClient: {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
    quit: jest.Mock;
  };

  beforeEach(async () => {
    pubClient = {
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    subClient = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisPubSubService,
        { provide: REDIS_PUB_CLIENT, useValue: pubClient },
        { provide: REDIS_SUB_CLIENT, useValue: subClient },
      ],
    }).compile();

    service = module.get<RedisPubSubService>(RedisPubSubService);
  });

  describe('publish', () => {
    it('should call client.publish with JSON stringified data', async () => {
      const channel = 'order-updates';
      const data = { orderId: '123', event: 'TEST_EVENT' };

      await service.publish(channel, data);

      expect(pubClient.publish).toHaveBeenCalledWith(
        channel,
        JSON.stringify(data),
      );
    });
  });

  describe('subscribe', () => {
    it('should subscribe to channel and set up message listener', async () => {
      const channel = 'order-updates';
      const handler = jest.fn();

      const unsubscribeFn = await service.subscribe(channel, handler);

      expect(subClient.subscribe).toHaveBeenCalledWith(channel);
      expect(subClient.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(typeof unsubscribeFn).toBe('function');
    });

    it('should call handler when message is received on subscribed channel', async () => {
      const channel = 'order-updates';
      const handler = jest.fn();

      await service.subscribe(channel, handler);

      const messageHandler = subClient.on.mock.calls.find(
        ([event]: [string]) => event === 'message',
      )?.[1];

      expect(messageHandler).toBeDefined();

      const payload = JSON.stringify({ orderId: '123', event: 'TEST' });
      messageHandler(channel, payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should not call handler for messages on different channels', async () => {
      const channel = 'order-updates';
      const handler = jest.fn();

      await service.subscribe(channel, handler);

      const messageHandler = subClient.on.mock.calls.find(
        ([event]: [string]) => event === 'message',
      )?.[1];

      const payload = JSON.stringify({ orderId: '123', event: 'TEST' });
      messageHandler('other-channel', payload);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from all channels and remove listener', async () => {
      const channel = 'order-updates';
      const handler = jest.fn();

      await service.subscribe(channel, handler);
      await service.unsubscribe();

      expect(subClient.unsubscribe).toHaveBeenCalled();
      expect(subClient.off).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up subscriptions and quit clients', async () => {
      const channel = 'order-updates';
      const handler = jest.fn();

      await service.subscribe(channel, handler);
      await service.onModuleDestroy();

      expect(subClient.unsubscribe).toHaveBeenCalled();
      expect(subClient.quit).toHaveBeenCalled();
      expect(pubClient.quit).toHaveBeenCalled();
    });

    it('should handle cleanup when no subscriptions exist', async () => {
      await service.onModuleDestroy();

      expect(subClient.quit).toHaveBeenCalled();
      expect(pubClient.quit).toHaveBeenCalled();
    });
  });
});
