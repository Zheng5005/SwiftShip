import { Queue } from 'bullmq';
import { dispatchQueueProvider } from './dispatch-queue.provider';

const mockQueueInstance = {
  close: jest.fn(),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueueInstance),
}));

describe('dispatchQueueProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a Queue named "dispatch"', () => {
    const result = dispatchQueueProvider.useFactory();
    expect(Queue).toHaveBeenCalledWith('dispatch', expect.any(Object));
    expect(result).toBe(mockQueueInstance);
  });

  it('should set default job options correctly', () => {
    dispatchQueueProvider.useFactory();
    const callArgs = (Queue as jest.MockedClass<typeof Queue>).mock.calls[0][1] as any;
    expect(callArgs.defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 5000,
    });
  });

  it('should use Redis connection from env vars', () => {
    dispatchQueueProvider.useFactory();
    const callArgs = (Queue as jest.MockedClass<typeof Queue>).mock.calls[0][1] as any;
    expect(callArgs.connection).toMatchObject({
      host: expect.any(String),
      port: expect.any(Number),
      db: expect.any(Number),
    });
  });

  it('should use custom Redis env vars when provided', () => {
    const originalHost = process.env.REDIS_HOST;
    const originalPort = process.env.REDIS_PORT;
    const originalDb = process.env.REDIS_DB;
    process.env.REDIS_HOST = 'custom-redis';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_DB = '2';

    dispatchQueueProvider.useFactory();
    const callArgs = (Queue as jest.MockedClass<typeof Queue>).mock.calls[0][1] as any;
    expect(callArgs.connection.host).toBe('custom-redis');
    expect(callArgs.connection.port).toBe(6380);
    expect(callArgs.connection.db).toBe(2);

    process.env.REDIS_HOST = originalHost;
    process.env.REDIS_PORT = originalPort;
    process.env.REDIS_DB = originalDb;
  });
});
