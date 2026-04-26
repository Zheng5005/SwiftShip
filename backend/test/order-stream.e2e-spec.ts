import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import * as http from 'http';
import { App } from 'supertest/types';
import configuration from './../src/config/configuration';
import { OrderController } from './../src/modules/order/order.controller';
import { OrderService } from './../src/modules/order/order.service';
import { JwtStrategy } from './../src/modules/auth/jwt.strategy';
import { RolesGuard } from './../src/modules/auth/guards';
import { Order, OrderStatus } from './../src/entities/order.entity';
import { User } from './../src/entities/user.entity';
import { Courier } from './../src/entities/courier.entity';
import { DispatchQueueService } from './../src/modules/dispatch-queue/dispatch-queue.service';
import { RedisPubSubService } from './../src/modules/redis/redis.service';

function makeSseRequest(
  server: any,
  path: string,
  token: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        host: addr.address === '::' ? '127.0.0.1' : addr.address,
        port: addr.port,
        path,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
        res.destroy();
      },
    );

    req.on('error', (err: any) => {
      if (err.code !== 'ECONNRESET') {
        reject(err);
      }
    });

    req.end();
  });
}

describe('Order Stream SSE (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  const users = new Map<string, any>();
  const couriers = new Map<string, any>();
  const orders = new Map<string, any>();
  let orderIdCounter = 1;

  const mockOrderRepo = {
    create: jest.fn((dto) => ({
      ...dto,
      id: `order-${orderIdCounter++}`,
      status: OrderStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      courier: dto.courier || null,
    })),
    save: jest.fn((order) => {
      orders.set(order.id, order);
      return Promise.resolve(order);
    }),
    findOne: jest.fn(({ where }) => {
      if (where.id) {
        return Promise.resolve(orders.get(where.id) || null);
      }
      return Promise.resolve(null);
    }),
    find: jest.fn(() => Promise.resolve(Array.from(orders.values()))),
  };

  const mockUserRepo = {
    findOne: jest.fn(({ where }) => {
      if (where.id) return Promise.resolve(users.get(where.id) || null);
      if (where.email) {
        for (const u of users.values()) {
          if (u.email === where.email) return Promise.resolve(u);
        }
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    }),
  };

  const mockCourierRepo = {
    findOne: jest.fn(({ where }) => {
      if (where.id) return Promise.resolve(couriers.get(where.id) || null);
      if (where.email) {
        for (const c of couriers.values()) {
          if (c.email === where.email) return Promise.resolve(c);
        }
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    }),
    find: jest.fn(() => Promise.resolve(Array.from(couriers.values()))),
  };

  const mockDispatchQueueService = {
    enqueueMatchCourier: jest.fn().mockResolvedValue(undefined),
    enqueueExpireOrder: jest.fn().mockResolvedValue(undefined),
    cancelMatchCourier: jest.fn().mockResolvedValue(undefined),
    cancelExpireOrder: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisPubSubService = {
    subscribe: jest.fn().mockResolvedValue(jest.fn()),
    publish: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    users.set('user-1', {
      id: 'user-1',
      email: 'user@test.com',
      passwordHash: 'hash',
      fullName: 'Test User',
    });
    users.set('user-2', {
      id: 'user-2',
      email: 'user2@test.com',
      passwordHash: 'hash',
      fullName: 'Other User',
    });
    couriers.set('courier-1', {
      id: 'courier-1',
      email: 'courier@test.com',
      passwordHash: 'hash',
      fullName: 'Test Courier',
      vehicleType: 'bike',
      isActive: true,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'your-super-secret-jwt-key-change-in-production',
          signOptions: { expiresIn: '24h' },
        }),
      ],
      controllers: [OrderController],
      providers: [
        OrderService,
        JwtStrategy,
        RolesGuard,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Courier), useValue: mockCourierRepo },
        { provide: DispatchQueueService, useValue: mockDispatchQueueService },
        { provide: RedisPubSubService, useValue: mockRedisPubSubService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    jwtService = new JwtService({
      secret: 'your-super-secret-jwt-key-change-in-production',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    orders.clear();
    orderIdCounter = 1;
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 without JWT token', () => {
      return request(app.getHttpServer())
        .get('/orders/order-1/stream')
        .expect(401);
    });

    it('should return 200 with valid JWT token and SSE headers', async () => {
      // Create an order owned by user-1
      const order = {
        id: 'order-1',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
        status: OrderStatus.PENDING,
        user: users.get('user-1'),
        courier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orders.set('order-1', order);

      const token = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        role: 'user',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/order-1/stream',
        token,
      );

      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toMatch(/text\/event-stream/);
    });
  });

  describe('Authorization', () => {
    it('should allow user role to access stream for their own order', async () => {
      // Create an order owned by user-1
      const order = {
        id: 'order-1',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
        status: OrderStatus.PENDING,
        user: users.get('user-1'),
        courier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orders.set('order-1', order);

      const token = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        role: 'user',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/order-1/stream',
        token,
      );

      expect(result.status).toBe(200);
    });

    it('should return 403 when user tries to access another user order', async () => {
      // Create an order owned by user-2
      const order = {
        id: 'order-1',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
        status: OrderStatus.PENDING,
        user: users.get('user-2'),
        courier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orders.set('order-1', order);

      const token = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        role: 'user',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/order-1/stream',
        token,
      );

      expect(result.status).toBe(403);
    });

    it('should allow courier role to access stream for PENDING orders', async () => {
      const order = {
        id: 'order-1',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
        status: OrderStatus.PENDING,
        user: users.get('user-1'),
        courier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orders.set('order-1', order);

      const token = jwtService.sign({
        sub: 'courier-1',
        email: 'courier@test.com',
        role: 'courier',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/order-1/stream',
        token,
      );

      expect(result.status).toBe(200);
    });
  });

  describe('Stream Events', () => {
    it('should return SSE connection for existing order', async () => {
      const order = {
        id: 'order-1',
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
        status: OrderStatus.PENDING,
        user: users.get('user-1'),
        courier: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orders.set('order-1', order);

      const token = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        role: 'user',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/order-1/stream',
        token,
      );

      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toMatch(/text\/event-stream/);
    });

    it('should return 404 for non-existent order', async () => {
      const token = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        role: 'user',
      });

      const result = await makeSseRequest(
        app.getHttpServer(),
        '/orders/non-existent/stream',
        token,
      );

      expect(result.status).toBe(404);
    });
  });
});
