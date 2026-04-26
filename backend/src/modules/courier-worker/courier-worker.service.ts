import { Injectable, NotFoundException, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Worker } from 'bullmq';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Courier } from '../../entities/courier.entity';
import { RedisPubSubService } from '../redis/redis.service';

@Injectable()
export class CourierWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(CourierWorkerService.name);
  private worker?: Worker;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Courier)
    private readonly courierRepository: Repository<Courier>,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  setWorker(worker: Worker): void {
    this.worker = worker;
  }

  async processMatchCourier(job: Job): Promise<void> {
    const { orderId } = job.data;

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const activeCouriers = await this.courierRepository.find({
      where: { isActive: true },
    });

    if (!activeCouriers || activeCouriers.length === 0) {
      throw new Error('No active couriers available');
    }

    const selectedCourier =
      activeCouriers[Math.floor(Math.random() * activeCouriers.length)];

    order.status = OrderStatus.ACCEPTED;
    order.courier = selectedCourier;

    await this.orderRepository.save(order);

    // Simulate processing delay (~3s)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      await this.redisPubSubService.publish('order-updates', {
        orderId,
        event: 'COURIER_ASSIGNED',
        courierId: selectedCourier.id,
        status: 'ACCEPTED',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.logger.warn(`Pub/Sub publish failed for COURIER_ASSIGNED: ${err.message}`);
    }
  }

  async processExpireOrder(job: Job): Promise<void> {
    const { orderId } = job.data;

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Order ${orderId} not found, skipping expiration`);
      return;
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Order ${orderId} status is ${order.status}, skipping expiration`);
      return;
    }

    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    try {
      await this.redisPubSubService.publish('order-updates', {
        orderId,
        event: 'ORDER_EXPIRED',
        status: 'CANCELLED',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.logger.warn(`Pub/Sub publish failed for ORDER_EXPIRED: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
