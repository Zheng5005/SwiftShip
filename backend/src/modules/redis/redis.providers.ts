import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_PUB_CLIENT, REDIS_SUB_CLIENT } from './redis.constants';

const logger = new Logger('RedisProviders');

function createRedisClient(): Redis {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = parseInt(process.env.REDIS_DB || '0', 10);

  const client = new Redis({
    host,
    port,
    password,
    db,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(
        `Redis connection retry attempt ${times}, retrying in ${delay}ms...`,
      );
      return delay;
    },
    maxRetriesPerRequest: null,
  });

  client.on('error', (err) => {
    logger.warn(`Redis connection error: ${err.message}`);
  });

  client.on('connect', () => {
    logger.log('Redis client connected');
  });

  return client;
}

export const redisProviders = [
  {
    provide: REDIS_PUB_CLIENT,
    useFactory: () => createRedisClient(),
  },
  {
    provide: REDIS_SUB_CLIENT,
    useFactory: () => createRedisClient(),
  },
];
