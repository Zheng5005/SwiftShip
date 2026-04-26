import { Test, TestingModule } from '@nestjs/testing';
import { Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { take, toArray } from 'rxjs/operators';
import { OrderService } from './order.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { Courier } from '../../entities/courier.entity';
import { DispatchQueueService } from '../dispatch-queue/dispatch-queue.service';
import { RedisPubSubService } from '../redis/redis.service';

describe('OrderService', () => {
  let service: OrderService;
  let module: TestingModule;
  let orderRepository: Repository<Order>;
  let userRepository: Repository<User>;
  let courierRepository: Repository<Courier>;
  let dispatchQueueService: DispatchQueueService;
  let redisPubSubService: { subscribe: jest.Mock; publish: jest.Mock };
  let loggerWarnSpy: jest.SpyInstance;

  const mockOrderRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  });

  const mockUserRepository = () => ({
    findOne: jest.fn(),
  });

  const mockCourierRepository = () => ({
    findOne: jest.fn(),
  });

  const mockDispatchQueueService = () => ({
    enqueueMatchCourier: jest.fn().mockResolvedValue(undefined),
    enqueueExpireOrder: jest.fn().mockResolvedValue(undefined),
    cancelMatchCourier: jest.fn().mockResolvedValue(undefined),
    cancelExpireOrder: jest.fn().mockResolvedValue(undefined),
  });

  const mockRedisPubSubService = () => ({
    subscribe: jest.fn().mockResolvedValue(jest.fn()),
    publish: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    module = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useFactory: mockOrderRepository },
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        { provide: getRepositoryToken(Courier), useFactory: mockCourierRepository },
        { provide: DispatchQueueService, useFactory: mockDispatchQueueService },
        { provide: RedisPubSubService, useFactory: mockRedisPubSubService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    courierRepository = module.get<Repository<Courier>>(getRepositoryToken(Courier));
    dispatchQueueService = module.get<DispatchQueueService>(DispatchQueueService);
    redisPubSubService = module.get<RedisPubSubService>(RedisPubSubService) as any;
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  describe('create', () => {
    const dto = { pickupAddress: '123 Main St', dropoffAddress: '456 Oak St' };
    const requestUser = { userId: 'user-1', email: 'test@example.com', role: 'user' as const };

    it('should call enqueueMatchCourier and enqueueExpireOrder after successful save', async () => {
      const customer = { id: 'user-1' } as User;
      const savedOrder = { id: 'order-1', pickupAddress: '123 Main St', dropoffAddress: '456 Oak St', status: OrderStatus.PENDING, user: customer } as Order;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(orderRepository, 'create').mockReturnValue(savedOrder);
      jest.spyOn(orderRepository, 'save').mockResolvedValue(savedOrder);

      await service.create(dto, requestUser);

      expect(dispatchQueueService.enqueueMatchCourier).toHaveBeenCalledWith(
        'order-1',
        '123 Main St',
        '456 Oak St',
      );
      expect(dispatchQueueService.enqueueExpireOrder).toHaveBeenCalledWith('order-1');
    });

    it('should still save order when queue service throws', async () => {
      const customer = { id: 'user-1' } as User;
      const savedOrder = { id: 'order-1', pickupAddress: '123 Main St', dropoffAddress: '456 Oak St', status: OrderStatus.PENDING, user: customer } as Order;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(orderRepository, 'create').mockReturnValue(savedOrder);
      jest.spyOn(orderRepository, 'save').mockResolvedValue(savedOrder);
      jest.spyOn(dispatchQueueService, 'enqueueMatchCourier').mockRejectedValue(new Error('Queue down'));
      jest.spyOn(dispatchQueueService, 'enqueueExpireOrder').mockRejectedValue(new Error('Queue down'));

      const result = await service.create(dto, requestUser);

      expect(result).toBe(savedOrder);
      expect(orderRepository.save).toHaveBeenCalled();
    });

    it('should log warning when queue service throws', async () => {
      const customer = { id: 'user-1' } as User;
      const savedOrder = { id: 'order-1', pickupAddress: '123 Main St', dropoffAddress: '456 Oak St', status: OrderStatus.PENDING, user: customer } as Order;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(customer);
      jest.spyOn(orderRepository, 'create').mockReturnValue(savedOrder);
      jest.spyOn(orderRepository, 'save').mockResolvedValue(savedOrder);
      jest.spyOn(dispatchQueueService, 'enqueueMatchCourier').mockRejectedValue(new Error('Queue down'));

      await service.create(dto, requestUser);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
    });
  });

  describe('update', () => {
    const courierUser = { userId: 'courier-1', email: 'c@example.com', role: 'courier' as const };

    it('should cancel expire-order job when status changes to ACCEPTED', async () => {
      const courier = { id: 'courier-1' } as Courier;
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-1' } as User, courier: null } as Order;

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);
      jest.spyOn(courierRepository, 'findOne').mockResolvedValue(courier);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({ ...order, status: OrderStatus.ACCEPTED, courier } as Order);

      await service.update('order-1', { status: OrderStatus.ACCEPTED }, courierUser);

      expect(dispatchQueueService.cancelExpireOrder).toHaveBeenCalledWith('order-1');
    });

    it('should cancel match-courier job when status changes to CANCELLED', async () => {
      const courier = { id: 'courier-1' } as Courier;
      const order = { id: 'order-1', status: OrderStatus.ACCEPTED, user: { id: 'user-1' } as User, courier } as Order;

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({ ...order, status: OrderStatus.CANCELLED } as Order);

      await service.update('order-1', { status: OrderStatus.CANCELLED }, courierUser);

      expect(dispatchQueueService.cancelMatchCourier).toHaveBeenCalledWith('order-1');
    });

    it('should still save order when cancellation throws', async () => {
      const courier = { id: 'courier-1' } as Courier;
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-1' } as User, courier: null } as Order;
      const updatedOrder = { ...order, status: OrderStatus.ACCEPTED, courier } as Order;

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);
      jest.spyOn(courierRepository, 'findOne').mockResolvedValue(courier);
      jest.spyOn(orderRepository, 'save').mockResolvedValue(updatedOrder);
      jest.spyOn(dispatchQueueService, 'cancelExpireOrder').mockRejectedValue(new Error('Queue error'));

      const result = await service.update('order-1', { status: OrderStatus.ACCEPTED }, courierUser);

      expect(dispatchQueueService.cancelExpireOrder).toHaveBeenCalledWith('order-1');
      expect(result).toBe(updatedOrder);
      expect(orderRepository.save).toHaveBeenCalled();
    });
  });

  describe('streamOrder', () => {
    const requestUser = { userId: 'user-1', email: 'test@example.com', role: 'user' as const };

    it('should emit connected event with current order status', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-1' } } as Order;
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);

      const stream$ = await service.streamOrder('order-1', requestUser);
      const firstEvent = await new Promise<any>((resolve) => {
        stream$.pipe(take(1)).subscribe(resolve);
      });

      expect(firstEvent.data).toMatchObject({
        orderId: 'order-1',
        status: 'PENDING',
        event: 'connected',
      });
    });

    it('should throw ForbiddenException when user does not own order', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-2' } } as Order;
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);

      await expect(service.streamOrder('order-1', requestUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(null);

      await expect(service.streamOrder('order-1', requestUser)).rejects.toThrow(NotFoundException);
    });

    it('should emit filtered Pub/Sub messages for the order', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-1' } } as Order;
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);

      let messageHandler: ((message: string) => void) | undefined;
      redisPubSubService.subscribe.mockImplementation((_channel: string, handler: (message: string) => void) => {
        messageHandler = handler;
        return Promise.resolve(() => {});
      });

      const stream$ = await service.streamOrder('order-1', requestUser);
      const events: any[] = [];
      stream$.subscribe((e) => events.push(e));

      // Wait for initial event and subscription setup
      await new Promise((resolve) => setTimeout(resolve, 10));

      messageHandler?.(JSON.stringify({ orderId: 'order-1', event: 'COURIER_ASSIGNED', status: 'ACCEPTED' }));
      messageHandler?.(JSON.stringify({ orderId: 'order-2', event: 'OTHER', status: 'PENDING' }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events).toHaveLength(2);
      expect(events[0].data).toMatchObject({ event: 'connected' });
      expect(events[1].data).toMatchObject({
        orderId: 'order-1',
        event: 'COURIER_ASSIGNED',
        status: 'ACCEPTED',
      });
    });

    it('should unsubscribe from Redis on finalize', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING, user: { id: 'user-1' } } as Order;
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(order);

      const unsubscribeMock = jest.fn();
      redisPubSubService.subscribe.mockResolvedValue(unsubscribeMock);

      const stream$ = await service.streamOrder('order-1', requestUser);
      const subscription = stream$.subscribe();
      subscription.unsubscribe();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
