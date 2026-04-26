import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { Courier } from '../../entities/courier.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { JwtStrategy } from '../auth/jwt.strategy';
import { DispatchQueueModule } from '../dispatch-queue/dispatch-queue.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, Courier]), DispatchQueueModule],
  controllers: [OrderController],
  providers: [OrderService, JwtStrategy],
})
export class OrderModule {}
