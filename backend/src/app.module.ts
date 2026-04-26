import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeORMConfig } from './config/database.config';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { OrderModule } from './modules/order/order.module';
import { RedisModule } from './modules/redis/redis.module';
import { CourierWorkerModule } from './modules/courier-worker/courier-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    TypeOrmModule.forRoot(typeORMConfig),
    AuthModule,
    OrderModule,
    RedisModule,
    CourierWorkerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
