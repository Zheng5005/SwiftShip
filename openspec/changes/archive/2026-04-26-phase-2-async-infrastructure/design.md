# Design: Phase 2 — Async Infrastructure & Real-Time Notifications

## Technical Approach

Add Redis-backed BullMQ job processing and SSE real-time notifications to decouple courier matching and order expiration from the HTTP request loop. Five new capabilities are built in dependency order: Redis infra → dispatch queue → courier worker → order lifecycle → real-time notifications.

The approach follows the proposal's layered strategy: infrastructure first, then queue producer, then worker/consumer, then lifecycle logic, then SSE delivery. Each layer is a self-contained NestJS module that plugs into the existing `AppModule`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Queue system | BullMQ on Redis | RabbitMQ, Kafka, Agenda | Proposal mandates BullMQ; lightweight, same-process, no extra broker |
| Worker process | Same-process as API | Separate worker service | Phase 2 explicitly scopes to same-process; easier to debug, no IPC needed |
| Real-time transport | SSE via `@Sse()` | WebSocket, Socket.IO | SSE is simpler, unidirectional, spec-approved; no bidirectional need yet |
| Redis connection | Single `ioredis` client via global `RedisModule` | Separate connections per module | BullMQ manages its own connections; we need a dedicated client for Pub/Sub. Global module provides one shared Pub/Sub client, BullMQ creates its own |
| Pub/Sub client | Dedicated `ioredis` subscriber (not shared with BullMQ) | Share BullMQ's connection | Redis Pub/Sub subscribers enter subscriber mode, blocking normal commands. Must be separate |
| Job cancellation | Best-effort cancel + idempotent worker | Strict cancellation only | Jobs may already be processing when cancel is requested; worker checks order status as safety net |
| Expire delay config | `ORDER_EXPIRY_MS` env var (default 600000) | Hardcoded constant | Makes testing easier (short delays in test env) while keeping prod default at 10 min |

## Data Flow

### Order Creation Flow

```
Client ──POST /orders──→ OrderController
                                │
                                ▼
                         OrderService.create()
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
               DB save    dispatch.enqueue  dispatch.enqueue
               (sync)    MatchCourier(id)  ExpireOrder(id, delay)
                    │           │           │
                    └───────────┴───────────┘
                                │
                                ▼
                         Return 201 (immediate)
```

### Worker Processing Flow

```
BullMQ Worker picks up job
         │
    ┌────┴─────┐
    ▼          ▼
match-courier  expire-order
    │              │
    ▼              ▼
Find active    Fetch order
courier        status?
    │         ┌───┴───┐
    ▼         ▼       ▼
Assign to   PENDING?  Other
order       →CANCEL   →skip
    │         │
    ▼         ▼
Update DB   Update DB
    │         │
    └────┬────┘
         ▼
Publish to 'order-updates'
         │
         ▼
SSE clients receive event
```

### SSE Subscription Flow

```
Client ──GET /orders/:id/stream──→ OrderController.stream()
       ←── event: connected       │
       ←── event: COURIER_ASSIGNED│←── Pub/Sub 'order-updates'
       ←── event: ORDER_EXPIRED   │    (filtered by orderId)
       ←── heartbeat              │
       ──── disconnect ───────────→ finalize() → unsubscribe
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/docker-compose.yml` | Modify | Add Redis 7-alpine service, volume, health check, API dependency |
| `backend/.env.example` | Modify | Add `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `ORDER_EXPIRY_MS` |
| `backend/package.json` | Modify | Add `bullmq`, `ioredis` dependencies |
| `backend/src/modules/redis/redis.module.ts` | Create | Global module providing `REDIS_PUB_CLIENT` and `REDIS_SUB_CLIENT` tokens |
| `backend/src/modules/redis/redis.providers.ts` | Create | Factory providers for publisher and subscriber `ioredis` clients |
| `backend/src/modules/redis/redis.constants.ts` | Create | Token constants (`REDIS_PUB_CLIENT`, `REDIS_SUB_CLIENT`, `ORDER_UPDATES_CHANNEL`) |
| `backend/src/modules/redis/redis.service.ts` | Create | `RedisPubSubService` with `publish(channel, data)` and `subscribe(channel, handler)` methods |
| `backend/src/modules/dispatch-queue/dispatch-queue.module.ts` | Create | Module providing `DISPATCH_QUEUE` token (BullMQ Queue) |
| `backend/src/modules/dispatch-queue/dispatch-queue.service.ts` | Create | `DispatchQueueService` with `enqueueMatchCourier()` and `enqueueExpireOrder()` |
| `backend/src/modules/dispatch-queue/dispatch-queue.constants.ts` | Create | Queue name constant (`dispatch`), job name constants |
| `backend/src/modules/courier-worker/courier-worker.module.ts` | Create | Module creating BullMQ Worker, registering processors |
| `backend/src/modules/courier-worker/courier-worker.service.ts` | Create | `CourierWorkerService` with `processMatchCourier()` and `processExpireOrder()` |
| `backend/src/modules/order/order.service.ts` | Modify | Inject `DispatchQueueService`, call enqueue after `save()` |
| `backend/src/modules/order/order.controller.ts` | Modify | Add `@Sse(':id/stream')` endpoint returning `Observable<MessageEvent>` |
| `backend/src/modules/order/order.module.ts` | Modify | Import `RedisModule`, `DispatchQueueModule`, inject services |
| `backend/src/app.module.ts` | Modify | Import `RedisModule`, `DispatchQueueModule`, `CourierWorkerModule` |
| `bruno/SwiftShip API/Orders/Stream Order.bru` | Create | SSE endpoint test in Bruno collection |

## Interfaces / Contracts

```typescript
// Redis tokens
export const REDIS_PUB_CLIENT = 'REDIS_PUB_CLIENT';
export const REDIS_SUB_CLIENT = 'REDIS_SUB_CLIENT';
export const ORDER_UPDATES_CHANNEL = 'order-updates';

// Dispatch queue tokens & job names
export const DISPATCH_QUEUE = 'DISPATCH_QUEUE';
export const JOB_MATCH_COURIER = 'match-courier';
export const JOB_EXPIRE_ORDER = 'expire-order';

// DispatchQueueService
interface IMatchCourierPayload { orderId: string; pickupAddress: string; dropoffAddress: string; }
interface IExpireOrderPayload { orderId: string; }

// RedisPubSubService
interface IOrderEvent {
  orderId: string;
  event: 'COURIER_ASSIGNED' | 'ORDER_EXPIRED';
  status: OrderStatus;
  timestamp: string;
  courierId?: string;
}

// SSE event format (NestJS MessageEvent)
// event: <event_type>
// data: {"orderId":"...","status":"...","timestamp":"..."}
// id: <monotonic-counter>
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `RedisPubSubService.publish/subscribe` | Mock ioredis client, verify `publish()` called with JSON payload |
| Unit | `DispatchQueueService.enqueueMatchCourier/enqueueExpireOrder` | Mock BullMQ Queue, verify `add()` called with correct job name, payload, opts |
| Unit | `CourierWorkerService.processMatchCourier` | Mock TypeORM repos + RedisPubSubService, verify courier selection and DB update |
| Unit | `CourierWorkerService.processExpireOrder` | Mock Order repo + RedisPubSubService, verify PENDING→CANCELLED and skip for other statuses |
| Unit | `OrderService.create` (modified) | Mock DispatchQueueService, verify both jobs enqueued after save |
| Integration | SSE endpoint `GET /orders/:id/stream` | Use `supertest`, verify `Content-Type: text/event-stream`, auth guard, ownership guard |
| Integration | Worker end-to-end | Start app with test Redis, enqueue job via Queue, verify DB state and Pub/Sub message |
| E2E | Full order lifecycle | Create order via API → verify SSE receives COURIER_ASSIGNED event; test expiration scenario |

## Migration / Rollout

No database migration required — `Order.courier_id` (nullable) and `OrderStatus` enum already exist. Rollback: revert commit; all new modules are self-contained, `POST /orders` reverts to synchronous. Redis service in docker-compose can stay idle or be removed.

## Open Questions

- [ ] Should `CourierWorkerModule` be conditionally loaded (e.g., via `BULLMQ_ENABLED` flag) so the app can run without Redis in dev?
- [ ] The current `OrderService.update()` manually sets `order.courier` when status transitions to ACCEPTED (line ~114). The worker will also do this — need to ensure no conflict if both paths exist post-Phase 2.
- [ ] SSE keep-alive interval —	spec doesn't specify; propose 30s heartbeat to detect dead connections.