import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
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

describe('Order Lifecycle (e2e)', () => {
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
    find: jest.fn(({ where } = {}) => {
      const all = Array.from(orders.values());
      if (where && where.user && where.user.id) {
        return Promise.resolve(all.filter((o) => o.user?.id === where.user.id));
      }
      return Promise.resolve(all);
    }),
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

  it('should create an order via API and verify status is PENDING', async () => {
    const token = jwtService.sign({
      sub: 'user-1',
      email: 'user@test.com',
      role: 'user',
    });

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pickupAddress: '123 Main St, City',
        dropoffAddress: '456 Oak Ave, Town',
      })
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.PENDING);
    expect(response.body.pickupAddress).toBe('123 Main St, City');
    expect(response.body.dropoffAddress).toBe('456 Oak Ave, Town');
  });

  it('should retrieve created order and confirm PENDING status', async () => {
    const token = jwtService.sign({
      sub: 'user-1',
      email: 'user@test.com',
      role: 'user',
    });

    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
      })
      .expect(201);

    const orderId = createRes.body.id;
    expect(createRes.body.status).toBe(OrderStatus.PENDING);

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getRes.body.status).toBe(OrderStatus.PENDING);
    expect(getRes.body.id).toBe(orderId);
  });

  it('should transition order status from PENDING to ACCEPTED via courier API update', async () => {
    const userToken = jwtService.sign({
      sub: 'user-1',
      email: 'user@test.com',
      role: 'user',
    });
    const courierToken = jwtService.sign({
      sub: 'courier-1',
      email: 'courier@test.com',
      role: 'courier',
    });

    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
      })
      .expect(201);

    const orderId = createRes.body.id;
    expect(createRes.body.status).toBe(OrderStatus.PENDING);

    const patchRes = await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ status: OrderStatus.ACCEPTED });

    if (patchRes.status !== 200) {
      console.log('PATCH response status:', patchRes.status);
      console.log('PATCH response body:', patchRes.body);
    }

    expect(patchRes.status).toBe(200);

    expect(patchRes.body.status).toBe(OrderStatus.ACCEPTED);

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(getRes.body.status).toBe(OrderStatus.ACCEPTED);
  });

  it('should not allow user to accept their own order', async () => {
    const userToken = jwtService.sign({
      sub: 'user-1',
      email: 'user@test.com',
      role: 'user',
    });

    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickupAddress: '123 Main St',
        dropoffAddress: '456 Oak St',
      })
      .expect(201);

    const orderId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: OrderStatus.ACCEPTED })
      .expect(403);
  });
});
