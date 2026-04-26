import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { Courier } from '../../entities/courier.entity';
import { RedisModule } from '../redis/redis.module';
import { CourierWorkerService } from './courier-worker.service';
import { courierWorkerProvider } from './courier-worker.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Courier]), RedisModule],
  providers: [courierWorkerProvider, CourierWorkerService],
})
export class CourierWorkerModule {}
