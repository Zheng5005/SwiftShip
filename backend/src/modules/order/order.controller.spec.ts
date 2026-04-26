import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { ExecutionContext } from '@nestjs/common';
import { Observable, of } from 'rxjs';

describe('OrderController', () => {
  let controller: OrderController;
  let orderService: { streamOrder: jest.Mock };

  beforeEach(async () => {
    orderService = {
      streamOrder: jest.fn().mockReturnValue(of({ data: { event: 'connected' } })),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: orderService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrderController>(OrderController);
  });

  describe('streamOrder', () => {
    it('should return a Promise resolving to an Observable from orderService.streamOrder', async () => {
      const result = await controller.streamOrder('order-1', { user: { userId: 'user-1', role: 'user' } });
      expect(result).toBeInstanceOf(Observable);
      expect(orderService.streamOrder).toHaveBeenCalledWith('order-1', { userId: 'user-1', role: 'user' });
    });
  });
});
