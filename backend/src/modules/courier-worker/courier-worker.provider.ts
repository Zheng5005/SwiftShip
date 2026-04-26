import { Worker } from 'bullmq';
import { COURIER_WORKER } from './courier-worker.constants';
import { CourierWorkerService } from './courier-worker.service';
import { JOB_MATCH_COURIER, JOB_EXPIRE_ORDER } from '../dispatch-queue/dispatch-queue.constants';

export const courierWorkerProvider = {
  provide: COURIER_WORKER,
  useFactory: (service: CourierWorkerService) => {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB || '0', 10);

    const worker = new Worker(
      'dispatch',
      async (job) => {
        if (job.name === JOB_MATCH_COURIER) {
          await service.processMatchCourier(job);
        } else if (job.name === JOB_EXPIRE_ORDER) {
          await service.processExpireOrder(job);
        }
      },
      {
        connection: { host, port, password, db },
        concurrency: 1,
      },
    );

    service.setWorker(worker);
    return worker;
  },
  inject: [CourierWorkerService],
};
