import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DISPATCH_QUEUE } from './dispatch-queue.constants';
import { RedisPubSubService } from '../redis/redis.service';

@Injectable()
export class DispatchQueueService {
  private readonly logger = new Logger(DispatchQueueService.name);

  constructor(
    @Inject(DISPATCH_QUEUE)
    private readonly queue: Queue,
    private readonly redisPubSubService: RedisPubSubService,
    private readonly configService: ConfigService,
  ) {}

  async enqueueMatchCourier(
    orderId: string,
    pickupAddress: string,
    dropoffAddress: string,
  ): Promise<void> {
    try {
      await this.queue.add('match-courier', { orderId, pickupAddress, dropoffAddress }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
    } catch (err) {
      this.logger.warn(`Failed to enqueue match-courier for order ${orderId}: ${err.message}`);
    }
  }

  async enqueueExpireOrder(orderId: string): Promise<void> {
    try {
      const orderExpiryMs = this.configService.get<number>('orderExpiryMs', 600000);
      await this.queue.add('expire-order', { orderId }, {
        delay: orderExpiryMs,
        attempts: 1,
      });
    } catch (err) {
      this.logger.warn(`Failed to enqueue expire-order for order ${orderId}: ${err.message}`);
    }
  }

  async cancelMatchCourier(orderId: string): Promise<void> {
    try {
      const jobs = await this.queue.getJobs(['delayed', 'wait', 'paused']);
      const job = jobs.find((j) => j.name === 'match-courier' && j.data.orderId === orderId);
      if (job) {
        await job.remove();
        this.logger.log(`Cancelled match-courier job for order ${orderId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to cancel match-courier for order ${orderId}: ${err.message}`);
    }
  }

  async cancelExpireOrder(orderId: string): Promise<void> {
    try {
      const jobs = await this.queue.getJobs(['delayed', 'wait', 'paused']);
      const job = jobs.find((j) => j.name === 'expire-order' && j.data.orderId === orderId);
      if (job) {
        await job.remove();
        this.logger.log(`Cancelled expire-order job for order ${orderId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to cancel expire-order for order ${orderId}: ${err.message}`);
    }
  }
}
