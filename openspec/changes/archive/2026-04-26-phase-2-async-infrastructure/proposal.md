# Proposal: Phase 2 — Async Infrastructure & Real-Time Notifications

## Intent

Decouple heavy/time-sensitive operations (courier matching, order expiration) from the HTTP request loop using Redis + BullMQ, and provide real-time order status updates to clients via SSE — eliminating polling and improving perceived performance.

## Scope

### In Scope
- Redis service in docker-compose with persistent storage and health checks
- BullMQ integration: `DispatchQueue` producer + `CourierWorker` consumer
- Modify `POST /orders` to enqueue `match-courier` job after persisting order
- SSE endpoint `GET /orders/:id/stream` subscribing to Redis Pub/Sub
- Delayed `expire-order` job (10 min) with cancellation logic
- Retry config: 3 attempts with exponential backoff on `match-courier`
- Redis Pub/Sub channel (`order-updates`) for worker→API communication
- `.env` / `.env.example` updates with Redis connection vars
- Bruno collection update for SSE endpoint

### Out of Scope
- Actual courier matching algorithm (simulated with delay + random assignment)
- WebSocket support (SSE only for now)
- Courier mobile app or courier-side real-time updates
- Horizontal scaling / multi-instance Pub/Sub coordination
- Dead letter queue monitoring or admin UI

## Capabilities

### New Capabilities
- `redis-infrastructure`: Redis docker service, connection config, Pub/Sub channel setup, env vars
- `dispatch-queue`: BullMQ queue provider, `match-courier` job creation on order POST
- `courier-worker`: BullMQ process listener, simulated courier assignment, DB update, event publishing
- `real-time-notifications`: SSE endpoint (`GET /orders/:id/stream`), Observable stream from Pub/Sub
- `order-lifecycle`: Delayed `expire-order` jobs, cancellation logic, retry/backoff configuration

### Modified Capabilities
- None (no existing specs to modify)

## Approach

1. **Infrastructure first**: Add Redis to docker-compose, update `.env`, create a `RedisModule` with connection provider
2. **Queue layer**: Create `DispatchQueueModule` wrapping BullMQ's `Queue`, inject into `OrderService` to enqueue after order creation
3. **Worker**: Create `CourierWorkerModule` with a BullMQ `Worker` instance that simulates matching (3s delay), assigns a random available courier, updates order status to `ACCEPTED`, publishes to `order-updates`
4. **SSE**: Add `@Sse()` endpoint in `OrderController` that subscribes to Pub/Sub, filters by order ID, returns `Observable<RawBody>`
5. **Delayed jobs**: Enqueue `expire-order` with `delay: 600_000` on order creation; worker checks status and cancels if still `PENDING`
6. **Retries**: Set `attempts: 3, backoff: { type: 'exponential', delay: 1000 }` on `match-courier` jobs

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/docker-compose.yml` | Modified | Add Redis service, volume, health check |
| `backend/.env.example` | Modified | Add `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| `backend/package.json` | Modified | Add `bullmq`, `ioredis` dependencies |
| `backend/src/modules/redis/` | New | Redis connection module, Pub/Sub service |
| `backend/src/modules/dispatch-queue/` | New | BullMQ queue provider, job creation service |
| `backend/src/modules/courier-worker/` | New | BullMQ worker, courier matching logic |
| `backend/src/modules/order/order.service.ts` | Modified | Enqueue jobs after order creation |
| `backend/src/modules/order/order.controller.ts` | Modified | Add SSE endpoint |
| `backend/src/app.module.ts` | Modified | Import new modules |
| `bruno/` | Modified | Add SSE request to collection |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Redis connection failures crash app startup | Medium | Health check dependency, graceful fallback, retry logic on connection |
| SSE connections leak on client disconnect | Medium | Use RxJS `finalize` to unsubscribe from Pub/Sub on disconnect |
| Worker runs in same process as API (no true separation) | High (by design) | Acceptable for Phase 2; document as known limitation for Phase 3 |
| Pub/Sub messages lost if no SSE subscriber active | Low | Order status persisted in DB; SSE is real-time only, not a log |

## Rollback Plan

1. Revert the change commit — all new modules are self-contained
2. Remove Redis service from docker-compose (or keep it idle — no breaking impact)
3. `POST /orders` reverts to synchronous behavior if queue injection is removed
4. No database migration required (courier assignment uses existing `courier_id` column)

## Dependencies

- `bullmq` and `ioredis` npm packages
- Redis 7+ (provided by docker-compose)
- Existing `Order` entity with `courier_id` nullable column (already present)

## Success Criteria

- [ ] `docker-compose up` starts api + db + redis with all health checks passing
- [ ] `POST /orders` returns 201 immediately; `match-courier` job appears in Redis queue
- [ ] `GET /orders/:id/stream` holds connection; receives SSE event when worker completes
- [ ] Order status transitions from `PENDING` → `ACCEPTED` with courier assigned
- [ ] Orders left `PENDING` for 10 min auto-expire to `CANCELLED` with SSE notification
- [ ] Failed `match-courier` jobs retry up to 3x with exponential backoff
- [ ] Bruno collection includes SSE endpoint test
