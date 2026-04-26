import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DispatchQueueService } from './dispatch-queue.service';
import { DISPATCH_QUEUE } from './dispatch-queue.constants';
import { RedisPubSubService } from '../redis/redis.service';

describe('DispatchQueueService', () => {
  let service: DispatchQueueService;
  let module: TestingModule;
  let queue: { add: jest.Mock; getJobs: jest.Mock };
  let redisPubSubService: { publish: jest.Mock };
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    redisPubSubService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    module = await Test.createTestingModule({
      providers: [
        DispatchQueueService,
        { provide: DISPATCH_QUEUE, useValue: queue },
        { provide: RedisPubSubService, useValue: redisPubSubService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(600000),
          },
        },
      ],
    }).compile();

    service = module.get<DispatchQueueService>(DispatchQueueService);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  describe('enqueueMatchCourier', () => {
    it('should call queue.add with correct job name, payload, and options', async () => {
      await service.enqueueMatchCourier('order-1', '123 Main St', '456 Oak St');
      expect(queue.add).toHaveBeenCalledWith(
        'match-courier',
        { orderId: 'order-1', pickupAddress: '123 Main St', dropoffAddress: '456 Oak St' },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    });
  });

  describe('enqueueExpireOrder', () => {
    it('should call queue.add with correct job name, payload, and delay', async () => {
      await service.enqueueExpireOrder('order-1');
      expect(queue.add).toHaveBeenCalledWith(
        'expire-order',
        { orderId: 'order-1' },
        { delay: 600000, attempts: 1 },
      );
    });

    it('should use orderExpiryMs from configuration', async () => {
      const configService = module.get<ConfigService>(ConfigService);
      jest.spyOn(configService, 'get').mockReturnValue(30000);

      await service.enqueueExpireOrder('order-1');

      expect(configService.get).toHaveBeenCalledWith('orderExpiryMs', 600000);
      expect(queue.add).toHaveBeenCalledWith(
        'expire-order',
        { orderId: 'order-1' },
        { delay: 30000, attempts: 1 },
      );
    });
  });

  describe('cancelMatchCourier', () => {
    it('should remove match-courier job for the given orderId', async () => {
      const mockJob = { name: 'match-courier', data: { orderId: 'order-1' }, remove: jest.fn().mockResolvedValue(undefined) };
      queue.getJobs.mockResolvedValue([mockJob]);

      await service.cancelMatchCourier('order-1');

      expect(queue.getJobs).toHaveBeenCalledWith(['delayed', 'wait', 'paused']);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should not throw if no matching job is found', async () => {
      queue.getJobs.mockResolvedValue([]);

      await expect(service.cancelMatchCourier('order-1')).resolves.toBeUndefined();
    });

    it('should log warning if cancellation fails', async () => {
      queue.getJobs.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.cancelMatchCourier('order-1')).resolves.toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
    });
  });

  describe('cancelExpireOrder', () => {
    it('should remove expire-order job for the given orderId', async () => {
      const mockJob = { name: 'expire-order', data: { orderId: 'order-1' }, remove: jest.fn().mockResolvedValue(undefined) };
      queue.getJobs.mockResolvedValue([mockJob]);

      await service.cancelExpireOrder('order-1');

      expect(queue.getJobs).toHaveBeenCalledWith(['delayed', 'wait', 'paused']);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should not throw if no matching job is found', async () => {
      queue.getJobs.mockResolvedValue([]);

      await expect(service.cancelExpireOrder('order-1')).resolves.toBeUndefined();
    });

    it('should log warning if cancellation fails', async () => {
      queue.getJobs.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.cancelExpireOrder('order-1')).resolves.toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
    });
  });

  describe('error handling', () => {
    it('should catch queue errors and log warning instead of throwing', async () => {
      queue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.enqueueMatchCourier('order-1', 'a', 'b')).resolves.toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
    });

    it('should catch expire-order errors and log warning instead of throwing', async () => {
      queue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.enqueueExpireOrder('order-1')).resolves.toBeUndefined();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
    });
  });
});
