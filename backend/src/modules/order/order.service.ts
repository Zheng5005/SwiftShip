import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject, ReplaySubject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MessageEvent } from '@nestjs/common';
import { ORDER_UPDATES_CHANNEL } from '../redis/redis.constants';
import { RedisPubSubService } from '../redis/redis.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { Courier } from '../../entities/courier.entity';
import { CreateOrderDto, UpdateOrderDto } from './dto/order.dto';
import { AuthRole } from '../auth/auth.service';
import { DispatchQueueService } from '../dispatch-queue/dispatch-queue.service';

interface RequestUser {
  userId: string;
  email: string;
  role: AuthRole;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Courier)
    private readonly courierRepository: Repository<Courier>,
    private readonly dispatchQueueService: DispatchQueueService,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  async create(dto: CreateOrderDto, user: RequestUser): Promise<Order> {
    if (user.role !== 'user') {
      throw new ForbiddenException('Only customers can create orders');
    }

    const customer = await this.userRepository.findOne({ where: { id: user.userId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const order = this.orderRepository.create({
      ...dto,
      user: customer,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(order);

    try {
      await this.dispatchQueueService.enqueueMatchCourier(
        savedOrder.id,
        savedOrder.pickupAddress,
        savedOrder.dropoffAddress,
      );
      await this.dispatchQueueService.enqueueExpireOrder(savedOrder.id);
    } catch (err) {
      this.logger.warn(`Failed to enqueue dispatch jobs for order ${savedOrder.id}: ${err.message}`);
    }

    return savedOrder;
  }

  async findAll(user: RequestUser): Promise<Order[]> {
    if (user.role === 'user') {
      return this.orderRepository.find({ where: { user: { id: user.userId } } });
    }

    // Couriers see PENDING orders + their assigned orders
    const courier = await this.courierRepository.findOne({ where: { id: user.userId } });
    if (!courier) {
      throw new NotFoundException('Courier not found');
    }

    return this.orderRepository.find({
      where: [
        { status: OrderStatus.PENDING },
        { courier: { id: courier.id } },
      ],
    });
  }

  async findOne(id: string, user: RequestUser): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Users can only see their own orders
    if (user.role === 'user' && order.user.id !== user.userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    // Couriers can only see assigned orders or PENDING orders
    if (user.role === 'courier') {
      const isAssigned = order.courier?.id === user.userId;
      const isPending = order.status === OrderStatus.PENDING;
      if (!isAssigned && !isPending) {
        throw new ForbiddenException('You do not have access to this order');
      }
    }

    return order;
  }

  async update(id: string, dto: UpdateOrderDto, user: RequestUser): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only couriers can update status (accept, in_transit, delivered)
    if (dto.status) {
      if (user.role !== 'courier') {
        throw new ForbiddenException('Only couriers can update order status');
      }

      // Courier must be assigned to update status (except for ACCEPTED which assigns them)
      if (dto.status === OrderStatus.ACCEPTED) {
        if (order.status !== OrderStatus.PENDING) {
          throw new BadRequestException('Order is not available for acceptance');
        }
        const courier = await this.courierRepository.findOne({ where: { id: user.userId } });
        if (!courier) {
          throw new NotFoundException('Courier not found');
        }
        order.courier = courier;
        try {
          await this.dispatchQueueService.cancelExpireOrder(order.id);
        } catch (err) {
          this.logger.warn(`Failed to cancel expire-order job for order ${order.id}: ${err.message}`);
        }
      } else if (dto.status === OrderStatus.CANCELLED) {
        try {
          await this.dispatchQueueService.cancelMatchCourier(order.id);
        } catch (err) {
          this.logger.warn(`Failed to cancel match-courier job for order ${order.id}: ${err.message}`);
        }
      } else if (order.courier?.id !== user.userId) {
        throw new ForbiddenException('You can only update orders assigned to you');
      }
    }

    // Users can only update address fields on PENDING orders
    if ((dto.pickupAddress || dto.dropoffAddress) && user.role === 'user') {
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Cannot modify order details after it has been accepted');
      }
      if (order.user.id !== user.userId) {
        throw new ForbiddenException('You can only modify your own orders');
      }
    }

    Object.assign(order, dto);
    return this.orderRepository.save(order);
  }

  async streamOrder(orderId: string, user: RequestUser): Promise<Observable<MessageEvent>> {
    const subject = new ReplaySubject<MessageEvent>(1);
    let unsubscribePromise: Promise<() => void> | null = null;

    // Authorization check - same as findOne
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.role === 'user' && order.user.id !== user.userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (user.role === 'courier') {
      const isAssigned = order.courier?.id === user.userId;
      const isPending = order.status === OrderStatus.PENDING;
      if (!isAssigned && !isPending) {
        throw new ForbiddenException('You do not have access to this order');
      }
    }

    // Send initial connected event
    subject.next({
      type: 'connected',
      data: {
        orderId,
        status: order.status,
        timestamp: new Date().toISOString(),
        event: 'connected',
      },
      id: `init-${Date.now()}`,
    });

    // Subscribe to Pub/Sub - store the promise for cleanup
    unsubscribePromise = this.redisPubSubService.subscribe(ORDER_UPDATES_CHANNEL, (message: string) => {
      try {
        const payload = JSON.parse(message);
        if (payload.orderId === orderId) {
          subject.next({
            type: payload.event,
            data: {
              orderId: payload.orderId,
              status: payload.status,
              courierId: payload.courierId,
              timestamp: payload.timestamp,
              event: payload.event,
            },
            id: `${payload.event}-${Date.now()}`,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to parse SSE message: ${err.message}`);
      }
    }).catch((err) => {
      this.logger.warn(`Failed to subscribe to SSE channel: ${err.message}`);
      return () => {};
    });

    return subject.asObservable().pipe(
      finalize(async () => {
        if (unsubscribePromise) {
          const unsub = await unsubscribePromise;
          unsub();
        }
        subject.complete();
      }),
    );
  }
}
