import { Global, Module } from '@nestjs/common';
import { RedisPubSubService } from './redis.service';
import { redisProviders } from './redis.providers';

@Global()
@Module({
  providers: [...redisProviders, RedisPubSubService],
  exports: [RedisPubSubService],
})
export class RedisModule {}
