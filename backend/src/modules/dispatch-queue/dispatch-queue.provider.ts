import { Queue } from 'bullmq';
import { DISPATCH_QUEUE } from './dispatch-queue.constants';

export const dispatchQueueProvider = {
  provide: DISPATCH_QUEUE,
  useFactory: () => {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB || '0', 10);

    return new Queue('dispatch', {
      connection: { host, port, password, db },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 5000,
      },
    });
  },
};
