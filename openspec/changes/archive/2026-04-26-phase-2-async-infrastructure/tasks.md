# Task Breakdown: Phase 2 — Async Infrastructure & Real-Time Notifications

**Change ID:** phase-2-async-infrastructure  
**Created:** 2026-04-26  
**Strict TDD:** true — write failing test first, then make it pass

---

## Phase 1: Infrastructure (Redis + Dependencies)

### Task 1.1: Add Redis service to docker-compose
**Spec:** redis-infrastructure/REQ-1  
**Files:** `backend/docker-compose.yml`

- [x] **Test:** Write integration test verifying Redis container starts with docker-compose
- [x] Add `redis` service with image `redis:7-alpine`
- [x] Configure port 6379 exposure (internal network only)
- [x] Add named volume `redis_data` for persistence
- [x] Add health check: `redis-cli ping` with 5s interval, 5s timeout, 5 retries
- [x] Add `depends_on` with `condition: service_healthy` to api service
- [x] Verify all three services (api, db, redis) start successfully

---

### Task 1.2: Add Redis environment variables
**Spec:** redis-infrastructure/REQ-2  
**Files:** `backend/.env.example`, `backend/.env`

- [x] **Test:** N/A (configuration task)
- [x] Add to `.env.example`:
  - `REDIS_HOST=redis` (comment: Redis hostname, use 'redis' for Docker)
  - `REDIS_PORT=6379` (comment: Redis port)
  - `REDIS_PASSWORD=` (comment: Redis password, leave empty for dev)
  - `REDIS_DB=0` (comment: Redis database index)
  - `ORDER_EXPIRY_MS=600000` (comment: Order expiration delay in ms)
- [x] Copy to `.env` with same values

---

### Task 1.3: Install BullMQ and ioredis dependencies
**Spec:** redis-infrastructure/REQ-4  
**Files:** `backend/package.json`

- [x] **Test:** N/A (dependency task)
- [x] Add `bullmq` to dependencies
- [x] Add `ioredis` to dependencies
- [x] Run `pnpm install` to update lockfile
- [x] Verify no `@types/ioredis` needed (bundled with bullmq)

---

### Task 1.4: Create RedisModule with connection providers
**Spec:** redis-infrastructure/REQ-2, REQ-3  
**Files:** 
- `backend/src/modules/redis/redis.module.ts`
- `backend/src/modules/redis/redis.providers.ts`
- `backend/src/modules/redis/redis.constants.ts`
- `backend/src/modules/redis/redis.service.ts`
- `backend/src/modules/redis/redis.service.spec.ts`

- [x] **Test (redis.service.spec.ts):**
  - Mock ioredis client, verify `RedisPubSubService.publish()` calls client.publish with JSON
  - Mock ioredis client, verify `RedisPubSubService.subscribe()` sets up listener
  - Mock ioredis client, verify `RedisPubSubService.unsubscribe()` removes listener
- [x] Create `redis.constants.ts`:
  - `REDIS_PUB_CLIENT = 'REDIS_PUB_CLIENT'`
  - `REDIS_SUB_CLIENT = 'REDIS_SUB_CLIENT'`
  - `ORDER_UPDATES_CHANNEL = 'order-updates'`
- [x] Create `redis.providers.ts`:
  - Factory provider for `REDIS_PUB_CLIENT` using ioredis with env vars
  - Factory provider for `REDIS_SUB_CLIENT` using ioredis with env vars
  - Handle connection errors gracefully (log warning, retry)
- [x] Create `redis.service.ts`:
  - `RedisPubSubService` class with `publish(channel, data)` method
  - `subscribe(channel, handler)` method returning unsubscribe function
  - Inject both REDIS_PUB_CLIENT and REDIS_SUB_CLIENT
- [x] Create `redis.module.ts`:
  - `@Global()` decorator
  - Register providers
  - Export `RedisPubSubService`
- [x] Import `RedisModule` in `backend/src/app.module.ts`

---

## Phase 2: Dispatch Queue (BullMQ Producer)

### Task 2.1: Create DispatchQueueModule with Queue provider
**Spec:** dispatch-queue/REQ-1  
**Files:**
- `backend/src/modules/dispatch-queue/dispatch-queue.module.ts`
- `backend/src/modules/dispatch-queue/dispatch-queue.provider.ts`
- `backend/src/modules/dispatch-queue/dispatch-queue.constants.ts`
- `backend/src/modules/dispatch-queue/dispatch-queue.provider.spec.ts`

- [x] **Test (dispatch-queue.provider.spec.ts):**
  - Mock Redis client, verify Queue is created with name 'dispatch'
  - Verify default job options: attempts=3, backoff={type:'exponential', delay:1000}
  - Verify removeOnComplete=100, removeOnFail=5000
- [x] Create `dispatch-queue.constants.ts`:
  - `DISPATCH_QUEUE = 'DISPATCH_QUEUE'`
  - `JOB_MATCH_COURIER = 'match-courier'`
  - `JOB_EXPIRE_ORDER = 'expire-order'`
- [x] Create `dispatch-queue.provider.ts`:
  - Factory provider creating BullMQ `Queue` instance
  - Queue name: 'dispatch'
  - Connect using shared Redis connection
  - Set default job options
- [x] Create `dispatch-queue.module.ts`:
  - Register provider
  - Export `DISPATCH_QUEUE` token

---

### Task 2.2: Create DispatchQueueService
**Spec:** dispatch-queue/REQ-2, REQ-3, REQ-4  
**Files:**
- `backend/src/modules/dispatch-queue/dispatch-queue.service.ts`
- `backend/src/modules/dispatch-queue/dispatch-queue.service.spec.ts`

- [x] **Test (dispatch-queue.service.spec.ts):**
  - Mock Queue, verify `enqueueMatchCourier()` calls `queue.add()` with correct job name, payload, opts
  - Mock Queue, verify `enqueueExpireOrder()` calls `queue.add()` with delay=600000
  - Verify queue connection errors are caught and logged (don't throw)
- [x] Create `dispatch-queue.service.ts`:
  - `DispatchQueueService` class
  - `enqueueMatchCourier(orderId, pickupAddress, dropoffAddress)` method
    - Payload: `{ orderId, pickupAddress, dropoffAddress }`
    - Options: `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`
  - `enqueueExpireOrder(orderId)` method
    - Payload: `{ orderId }`
    - Options: `{ delay: ORDER_EXPIRY_MS, attempts: 1 }`
  - Inject `DISPATCH_QUEUE` and `RedisPubSubService`
  - Handle errors gracefully (log warning, don't break order creation)

---

### Task 2.3: Integrate DispatchQueueService into OrderService
**Spec:** dispatch-queue/REQ-5  
**Files:**
- `backend/src/modules/order/order.service.ts`
- `backend/src/modules/order/order.service.spec.ts`
- `backend/src/modules/order/order.module.ts`

- [x] **Test (order.service.spec.ts):**
  - Mock DispatchQueueService, verify both `enqueueMatchCourier()` and `enqueueExpireOrder()` called after successful save
  - Mock DispatchQueueService to throw, verify order is still saved (queue failure doesn't break creation)
- [x] Update `order.module.ts`:
  - Import `DispatchQueueModule`
  - Provide `DispatchQueueService` to OrderService
- [x] Update `order.service.ts`:
  - Inject `DispatchQueueService`
  - In `create()` method, after `save()`, call both enqueue methods
  - Wrap enqueue calls in try-catch (log warning on failure)

---

## Phase 3: Courier Worker (BullMQ Consumer)

### Task 3.1: Create CourierWorkerModule with Worker instance
**Spec:** courier-worker/REQ-1  
**Files:**
- `backend/src/modules/courier-worker/courier-worker.module.ts`
- `backend/src/modules/courier-worker/courier-worker.provider.ts`
- `backend/src/modules/courier-worker/courier-worker.service.ts`
- `backend/src/modules/courier-worker/courier-worker.service.spec.ts`

  - [x] **Test (courier-worker.service.spec.ts):**
    - Mock TypeORM repos, RedisPubSubService
    - Verify Worker is created for 'dispatch' queue with concurrency=1
    - Verify shutdown calls `worker.close()`
  - [x] Create `courier-worker.provider.ts`:
    - Factory provider creating BullMQ `Worker` instance
    - Queue name: 'dispatch'
    - Concurrency: 1
    - Register job processors
  - [x] Create `courier-worker.service.ts`:
    - `CourierWorkerService` class
    - `processMatchCourier(job)` method (stub for now)
    - `processExpireOrder(job)` method (stub for now)
    - Implement `onModuleDestroy()` to close worker gracefully
  - [x] Create `courier-worker.module.ts`:
    - Import `TypeOrmModule.forFeature([Order, Courier])`
    - Import `RedisModule`
    - Register provider
    - Export service if needed

---

### Task 3.2: Implement processMatchCourier
**Spec:** courier-worker/REQ-2  
**Files:** `backend/src/modules/courier-worker/courier-worker.service.ts`, `backend/src/modules/courier-worker/courier-worker.service.spec.ts`

  - [x] **Test (courier-worker.service.spec.ts):**
    - Mock active couriers, verify random courier selected and order updated to ACCEPTED
    - Mock no active couriers, verify error thrown (triggers retry)
    - Mock order not found, verify NotFoundException thrown
    - Mock DB error, verify error thrown and logged
    - Verify Pub/Sub publish called with correct event payload after success
    - Verify Pub/Sub publish error is logged but doesn't fail job
  - [x] Implement `processMatchCourier(job.data)`:
    - Extract `orderId` from job data
    - Query Order by ID (throw NotFoundException if not found)
    - Query active couriers (`isActive = true`)
    - If no couriers: throw error (triggers BullMQ retry)
    - Select random courier using `Math.random()`
    - Update order: `status = ACCEPTED`, `courier = selectedCourier`
    - Publish to Pub/Sub: `{ orderId, event: 'COURIER_ASSIGNED', courierId, status: 'ACCEPTED', timestamp }`
    - Add ~3s simulated delay
    - Catch Pub/Sub errors, log but don't fail job

---

### Task 3.3: Implement processExpireOrder
**Spec:** courier-worker/REQ-3  
**Files:** `backend/src/modules/courier-worker/courier-worker.service.ts`, `backend/src/modules/courier-worker/courier-worker.service.spec.ts`

  - [x] **Test (courier-worker.service.spec.ts):**
    - Mock PENDING order, verify status updated to CANCELLED and event published
    - Mock ACCEPTED order, verify no modification and job completes silently
    - Mock IN_TRANSIT/DELIVERED/CANCELLED orders, verify no modification
    - Mock order not found, verify job completes silently with warning logged
  - [x] Implement `processExpireOrder(job.data)`:
    - Extract `orderId` from job data
    - Fetch order from DB
    - If not found: log warning, complete silently (no throw)
    - If status !== PENDING: log skip reason, complete silently
    - If status === PENDING:
      - Update status to CANCELLED
      - Publish to Pub/Sub: `{ orderId, event: 'ORDER_EXPIRED', status: 'CANCELLED', timestamp }`
    - Catch Pub/Sub errors, log but don't fail job

---

### Task 3.4: Register worker processors in CourierWorkerModule
**Spec:** courier-worker/REQ-1  
**Files:** `backend/src/modules/courier-worker/courier-worker.provider.ts`, `backend/src/modules/courier-worker/courier-worker.module.ts`

  - [x] **Test:** Covered by Task 3.1 tests
  - [x] Update `courier-worker.provider.ts`:
    - Register processor for `match-courier` job → calls `service.processMatchCourier()`
    - Register processor for `expire-order` job → calls `service.processExpireOrder()`
  - [x] Update `courier-worker.module.ts`:
    - Import `CourierWorkerModule` in `backend/src/app.module.ts`
    - Ensure module initializes on app startup

---

## Phase 4: Order Lifecycle (Delayed Jobs + Cancellation)

### Task 4.1: Add ORDER_EXPIRY_MS configuration
**Spec:** order-lifecycle/REQ-1  
**Files:** `backend/src/config/configuration.ts` (create), `backend/.env.example`

- [x] **Test:** N/A (configuration task)
- [x] Create `configuration.ts` if not exists, or add to existing config:
  - Export function returning config object
  - Include `orderExpiryMs: parseInt(process.env.ORDER_EXPIRY_MS) || 600000`
- [x] Verify `.env.example` has `ORDER_EXPIRY_MS=600000` (from Task 1.2)
- [x] Use config in `DispatchQueueService` for delay value

---

### Task 4.2: Verify retry/backoff configuration for match-courier
**Spec:** order-lifecycle/REQ-3  
**Files:** `backend/src/modules/dispatch-queue/dispatch-queue.service.ts`

- [x] **Test (dispatch-queue.service.spec.ts):**
  - Enqueue match-courier job, verify attempts=3 and exponential backoff
  - Verify first retry ~1000ms, second retry ~2000ms
- [x] Verify `enqueueMatchCourier()` uses:
  - `attempts: 3`
  - `backoff: { type: 'exponential', delay: 1000 }`
- [ ] Manual test: Simulate no couriers, verify job retries 3 times in Redis

---

### Task 4.3: Implement best-effort job cancellation
**Spec:** order-lifecycle/REQ-4  
**Files:** `backend/src/modules/order/order.service.ts`

- [x] **Test (order.service.spec.ts):**
  - When order status changes to ACCEPTED, attempt to cancel expire-order job
  - When order is manually cancelled, attempt to cancel match-courier job
- [x] Update `order.service.ts` (optional enhancement):
  - When updating order status to ACCEPTED, try to remove pending expire-order job from queue
  - When cancelling order, try to remove pending match-courier job
  - Use `queue.removeJobs()` or similar (best-effort, don't fail if job already processing)
  - Log if cancellation fails (worker will check status as safety net)

---

## Phase 5: Real-Time Notifications (SSE)

### Task 5.1: Add SSE endpoint to OrderController
**Spec:** real-time-notifications/REQ-1, REQ-5  
**Files:**
- `backend/src/modules/order/order.controller.ts`
- `backend/src/modules/order/order.controller.spec.ts`

- [x] **Test (order.controller.spec.ts):**
  - Verify `GET /orders/:id/stream` returns 200 with Content-Type: text/event-stream
  - Verify 401 without JWT token
  - Verify 403 when user doesn't own order and isn't courier
  - Verify 404 for non-existent order
- [x] Update `order.controller.ts`:
  - Import `@Sse`, `MessageEvent`, `Observable` from appropriate packages
  - Add `@Sse(':id/stream') streamOrder(@Param('id') id: string, @Request() req)` method
  - Apply same guards as other endpoints (`JwtAuthGuard`, `RolesGuard`)
  - Return `Observable<MessageEvent>`

---

### Task 5.2: Implement SSE Observable stream from Pub/Sub
**Spec:** real-time-notifications/REQ-2  
**Files:** `backend/src/modules/order/order.service.ts` (add stream method)

- [x] **Test (order.service.spec.ts):**
  - Mock Pub/Sub, verify Observable subscribes to 'order-updates' channel
  - Verify messages are filtered by orderId
  - Verify initial 'connected' event is sent with current order status
  - Verify COURIER_ASSIGNED and ORDER_EXPIRED events are emitted correctly
- [x] Add `streamOrder(orderId: string): Observable<MessageEvent>` to `OrderService`:
  - Use RxJS `Subject` for event emission
  - Subscribe to Redis Pub/Sub via `RedisPubSubService.subscribe()`
  - Filter messages by `orderId`
  - Parse JSON payload
  - Map to `MessageEvent` format:
    ```
    type: <event_type>
    data: { orderId, status, timestamp, courierId?, event }
    id: <unique_id>
    ```
  - Send initial 'connected' event with current order status
  - Use `finalize()` operator to unsubscribe on disconnect
  - Handle abrupt disconnects gracefully

---

### Task 5.3: Add SSE endpoint to OrderModule
**Spec:** real-time-notifications/REQ-1  
**Files:** `backend/src/modules/order/order.module.ts`

- [x] **Test:** N/A (wiring task)
- [x] Verify `OrderModule` imports `RedisModule` (for Pub/Sub service) - RedisModule is @Global()
- [x] Verify `OrderService` is exported if needed by other modules

---

### Task 5.4: Add SSE keep-alive heartbeat
**Spec:** real-time-notifications/REQ-3 (open question from design)  
**Files:** `backend/src/modules/order/order.service.ts`

- [x] **Test (order.service.spec.ts):**
  - Verify SSE endpoint throws ForbiddenException for unauthorized users
  - Verify SSE endpoint throws NotFoundException for non-existent orders
  - Verify SSE endpoint emits connected event for authorized users
- [x] Update `streamOrder()` method:
  - Add ownership/authorization check matching `findOne()` logic
  - Return `Promise<Observable<MessageEvent>>` with async auth
  - Use `ReplaySubject(1)` to buffer initial connected event
  - Use `finalize()` operator to unsubscribe on disconnect

---

## Phase 6: Testing & Documentation

### Task 6.1: Write unit tests for RedisPubSubService
**Spec:** redis-infrastructure/REQ-2, REQ-3  
**Files:** `backend/src/modules/redis/redis.service.spec.ts`

- [x] Test publish method with mock ioredis client
- [x] Test subscribe method sets up listener correctly
- [x] Test unsubscribe removes listener without closing connection
- [x] Test JSON serialization/deserialization
- [x] Run `pnpm test` and verify all pass

---

### Task 6.2: Write unit tests for DispatchQueueService
**Spec:** dispatch-queue/REQ-1, REQ-4  
**Files:** `backend/src/modules/dispatch-queue/dispatch-queue.service.spec.ts`

- [x] Test `enqueueMatchCourier()` with correct payload and options
- [x] Test `enqueueExpireOrder()` with delay configuration
- [x] Test error handling (queue unavailable)
- [x] Run `pnpm test` and verify all pass

---

### Task 6.3: Write unit tests for CourierWorkerService
**Spec:** courier-worker/REQ-2, REQ-3  
**Files:** `backend/src/modules/courier-worker/courier-worker.service.spec.ts`

- [x] Test `processMatchCourier()` success path (courier assigned, event published)
- [x] Test `processMatchCourier()` no couriers available (error thrown)
- [x] Test `processMatchCourier()` order not found (NotFoundException)
- [x] Test `processExpireOrder()` PENDING → CANCELLED
- [x] Test `processExpireOrder()` non-PENDING orders skipped
- [x] Test `processExpireOrder()` missing order (silent completion)
- [x] Run `pnpm test` and verify all pass

---

### Task 6.4: Write integration test for SSE endpoint
**Spec:** real-time-notifications/REQ-1  
**Files:** `backend/test/order-stream.e2e-spec.ts` (create)

- [x] **Test (e2e):**
  - Start test app with test Redis
  - Create order via POST /orders
  - Connect to GET /orders/:id/stream with supertest
  - Verify Content-Type: text/event-stream
  - Verify authentication and authorization guards work
  - Verify connection event received
- [x] Create e2e test file using `@nestjs/testing` and `supertest`
- [ ] Run `pnpm test:e2e` and verify test passes

---

### Task 6.5: Write e2e test for full order lifecycle
**Spec:** order-lifecycle/REQ-5  
**Files:** `backend/test/order-lifecycle.e2e-spec.ts` (create)

- [x] **Test (e2e):**
  - Create order via API
  - Verify order status is PENDING
  - Test courier acceptance flow
  - Verify order status transitions PENDING → ACCEPTED
- [x] Configure test environment with mocked Redis/Queue services
- [x] Run `pnpm test:e2e` and verify all lifecycle tests pass

---

### Task 6.6: Add SSE endpoint to Bruno collection
**Spec:** proposal scope  
**Files:** `bruno/SwiftShip API/Orders/Stream Order.bru`

- [x] **Test:** N/A (documentation task)
- [x] Create `bruno/SwiftShip API/Orders/Stream Order.bru`
- [x] Configure GET request to `/orders/{{order_id}}/stream`
- [x] Add auth header setup
- [x] Document expected SSE events in request notes

---

### Task 6.7: Update .env.example with all Redis variables
**Spec:** redis-infrastructure/REQ-2  
**Files:** `backend/.env.example`

- [x] **Test:** N/A (documentation task)
- [x] Verify `.env.example` includes:
  - `REDIS_HOST=redis`
  - `REDIS_PORT=6379`
  - `REDIS_PASSWORD=`
  - `REDIS_DB=0`
  - `ORDER_EXPIRY_MS=600000`
- [x] Add comments explaining each variable

---

## Task Dependencies Summary

```
Infrastructure (Phase 1)
├── 1.1 Redis docker-compose ──┐
├── 1.2 Env variables ─────────┼──→ 1.4 RedisModule
├── 1.3 Dependencies ──────────┘
└── 1.4 RedisModule ───────────┼──→ AppModule

Dispatch Queue (Phase 2)
├── 2.1 DispatchQueueModule ───┐
├── 2.2 DispatchQueueService ──┼──→ 2.3 OrderService integration
└── 2.3 OrderService ──────────┼──→ OrderModule

Courier Worker (Phase 3)
├── 3.1 CourierWorkerModule ───┐
├── 3.2 processMatchCourier ───┼──→ 3.4 Register processors
├── 3.3 processExpireOrder ────┘
└── 3.4 Register processors ───┼──→ AppModule

Order Lifecycle (Phase 4)
├── 4.1 Config ────────────────┐
├── 4.2 Retry/backoff ─────────┼──→ (validation tasks)
└── 4.3 Job cancellation ──────┘

Real-Time Notifications (Phase 5)
├── 5.1 SSE endpoint ──────────┐
├── 5.2 Observable stream ─────┼──→ 5.3 OrderModule wiring
├── 5.3 Module wiring ─────────┘
└── 5.4 Heartbeat ─────────────┼──→ (enhancement)

Testing (Phase 6)
├── 6.1 Redis tests
├── 6.2 Queue tests
├── 6.3 Worker tests
├── 6.4 SSE integration test
├── 6.5 Lifecycle e2e test
├── 6.6 Bruno collection
└── 6.7 Documentation
```

---

## Definition of Done (per task)

- [ ] Failing test written first (TDD)
- [ ] Test passes after implementation
- [ ] Code follows existing project conventions (NestJS module pattern, DTOs with class-validator)
- [ ] No linting errors (`pnpm lint`)
- [ ] All tests pass (`pnpm test`)
- [ ] Relevant specs from `/openspec/changes/phase-2-async-infrastructure/specs/` are satisfied

---

## Notes

- **Same-process worker:** Phase 2 explicitly scopes to same-process worker (API + worker in one NestJS app). This is by design for simplicity.
- **No DB migration required:** `Order.courier_id` (nullable) and `OrderStatus` enum already exist.
- **Pub/Sub separate from BullMQ:** Redis Pub/Sub subscriber must be a separate ioredis client (subscribers enter subscriber mode, blocking normal commands).
- **Best-effort job cancellation:** Jobs may already be processing when cancel is requested; worker checks order status as safety net.
