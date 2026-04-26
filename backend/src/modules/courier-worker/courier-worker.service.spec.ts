import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger, NotFoundException } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { CourierWorkerService } from './courier-worker.service';
import { courierWorkerProvider } from './courier-worker.provider';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Courier } from '../../entities/courier.entity';
import { RedisPubSubService } from '../redis/redis.service';

const mockWorkerInstance = {
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('bullmq', () => ({
  ...jest.requireActual('bullmq'),
  Worker: jest.fn().mockImplementation(() => mockWorkerInstance),
}));

describe('CourierWorkerService', () => {
  let service: CourierWorkerService;
  let orderRepo: { findOne: jest.Mock; save: jest.Mock };
  let courierRepo: { find: jest.Mock };
  let redisPubSubService: { publish: jest.Mock };
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    orderRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
    };
    courierRepo = {
      find: jest.fn(),
    };
    redisPubSubService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourierWorkerService,
        courierWorkerProvider,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Courier), useValue: courierRepo },
        { provide: RedisPubSubService, useValue: redisPubSubService },
      ],
    }).compile();

    service = module.get<CourierWorkerService>(CourierWorkerService);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  describe('worker initialization (Task 3.1)', () => {
    it('should create a Worker for dispatch queue with concurrency 1', () => {
      expect(Worker).toHaveBeenCalledWith(
        'dispatch',
        expect.any(Function),
        expect.objectContaining({ concurrency: 1 }),
      );
    });

    it('should close worker on module destroy', async () => {
      await service.onModuleDestroy();
      expect(mockWorkerInstance.close).toHaveBeenCalled();
    });
  });

  describe('processMatchCourier (Task 3.2)', () => {
    beforeEach(() => {
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: any) => {
          if (typeof callback === 'function') {
            callback();
          }
          return 0 as any;
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should select random courier and update order to ACCEPTED', async () => {
      const order = {
        id: 'order-1',
        status: OrderStatus.PENDING,
        courier: null,
      };
      const courier1 = { id: 'courier-1', isActive: true };
      const courier2 = { id: 'courier-2', isActive: true };

      orderRepo.findOne.mockResolvedValue(order);
      courierRepo.find.mockResolvedValue([courier1, courier2]);

      await service.processMatchCourier({
        data: { orderId: 'order-1' },
      } as Job);

      expect(orderRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
      expect(courierRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.ACCEPTED,
          courier: expect.any(Object),
        }),
      );
      expect(redisPubSubService.publish).toHaveBeenCalledWith(
        'order-updates',
        expect.objectContaining({
          orderId: 'order-1',
          event: 'COURIER_ASSIGNED',
          status: 'ACCEPTED',
          courierId: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should throw error when no active couriers available', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING };
      orderRepo.findOne.mockResolvedValue(order);
      courierRepo.find.mockResolvedValue([]);

      await expect(
        service.processMatchCourier({
          data: { orderId: 'order-1' },
        } as Job),
      ).rejects.toThrow('No active couriers available');
    });

    it('should throw NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.processMatchCourier({
          data: { orderId: 'order-1' },
        } as Job),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should log pub/sub error but not fail job', async () => {
      const order = {
        id: 'order-1',
        status: OrderStatus.PENDING,
        courier: null,
      };
      const courier = { id: 'courier-1', isActive: true };

      orderRepo.findOne.mockResolvedValue(order);
      courierRepo.find.mockResolvedValue([courier]);
      redisPubSubService.publish.mockRejectedValue(
        new Error('Pub/Sub fail'),
      );

      await service.processMatchCourier({
        data: { orderId: 'order-1' },
      } as Job);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pub/Sub'),
      );
      expect(orderRepo.save).toHaveBeenCalled();
    });
  });

  describe('processExpireOrder (Task 3.3)', () => {
    it('should cancel PENDING order and publish event', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING };
      orderRepo.findOne.mockResolvedValue(order);

      await service.processExpireOrder({
        data: { orderId: 'order-1' },
      } as Job);

      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.CANCELLED,
        }),
      );
      expect(redisPubSubService.publish).toHaveBeenCalledWith(
        'order-updates',
        expect.objectContaining({
          orderId: 'order-1',
          event: 'ORDER_EXPIRED',
          status: 'CANCELLED',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should skip non-PENDING orders silently', async () => {
      const order = { id: 'order-1', status: OrderStatus.ACCEPTED };
      orderRepo.findOne.mockResolvedValue(order);

      await service.processExpireOrder({
        data: { orderId: 'order-1' },
      } as Job);

      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(redisPubSubService.publish).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('skip'),
      );
    });

    it('should complete silently when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await service.processExpireOrder({
        data: { orderId: 'order-1' },
      } as Job);

      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });

    it('should log pub/sub error but not fail job', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING };
      orderRepo.findOne.mockResolvedValue(order);
      redisPubSubService.publish.mockRejectedValue(
        new Error('Pub/Sub fail'),
      );

      await service.processExpireOrder({
        data: { orderId: 'order-1' },
      } as Job);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pub/Sub'),
      );
      expect(orderRepo.save).toHaveBeenCalled();
    });
  });
});
