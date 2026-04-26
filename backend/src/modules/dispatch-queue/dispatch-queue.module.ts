import { Module } from '@nestjs/common';
import { dispatchQueueProvider } from './dispatch-queue.provider';
import { DISPATCH_QUEUE } from './dispatch-queue.constants';
import { DispatchQueueService } from './dispatch-queue.service';

@Module({
  providers: [dispatchQueueProvider, DispatchQueueService],
  exports: [DISPATCH_QUEUE, DispatchQueueService],
})
export class DispatchQueueModule {}
