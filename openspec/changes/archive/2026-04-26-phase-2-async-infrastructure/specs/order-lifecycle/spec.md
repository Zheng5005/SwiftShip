# Capability: order-lifecycle

Delayed order expiration jobs, cancellation logic, and retry/backoff configuration for the order processing pipeline.

## Requirements

### REQ-1: Delayed Expire-Order Jobs

The system SHALL schedule delayed jobs to automatically expire orders that remain unassigned.

#### Scenario: Expire-order job is scheduled on order creation

**Given** a new order is created via `POST /orders`
**When** the order is persisted with status `PENDING`
**Then** an `expire-order` job is enqueued with `delay: 600_000` (10 minutes)
**And** the job is associated with the order's UUID

#### Scenario: Expire-order job fires after delay

**Given** an `expire-order` job is enqueued with a 10-minute delay
**When** 10 minutes pass without the job being cancelled
**Then** the BullMQ worker picks up the job
**And** the job processor executes the expiration logic

#### Scenario: Expire-order job delay is configurable

**Given** the order lifecycle configuration
**When** the expiration delay is inspected
**Then** the default value is `600_000` milliseconds (10 minutes)
**And** the value is defined as a constant or environment variable (`ORDER_EXPIRY_MINUTES`)
**And** changing the value affects all newly enqueued expiration jobs

### REQ-2: Order Cancellation Logic

The system SHALL cancel orders that remain in `PENDING` status past the expiration time.

#### Scenario: Pending order is cancelled on expiration

**Given** an `expire-order` job fires for an order
**When** the order's current status is `PENDING`
**Then** the order status is updated to `CANCELLED`
**And** the `updated_at` timestamp is refreshed
**And** an `ORDER_EXPIRED` event is published to `order-updates` Pub/Sub

#### Scenario: Accepted order is NOT cancelled on expiration

**Given** an `expire-order` job fires for an order
**When** the order's current status is `ACCEPTED`
**Then** the order status is NOT modified
**And** NO event is published
**And** the job completes successfully (no error)

#### Scenario: In-transit order is NOT cancelled on expiration

**Given** an `expire-order` job fires for an order
**When** the order's current status is `IN_TRANSIT`
**Then** the order status is NOT modified
**And** NO event is published
**And** the job completes successfully

#### Scenario: Delivered order is NOT cancelled on expiration

**Given** an `expire-order` job fires for an order
**When** the order's current status is `DELIVERED`
**Then** the order status is NOT modified
**And** NO event is published
**And** the job completes successfully

#### Scenario: Already-cancelled order is handled idempotently

**Given** an `expire-order` job fires for an order
**When** the order's current status is `CANCELLED`
**Then** the order status is NOT modified
**And** NO event is published
**And** the job completes successfully (no error, no duplicate cancellation)

### REQ-3: Match-Courier Retry and Backoff

The system SHALL retry failed `match-courier` jobs with exponential backoff.

#### Scenario: Failed match-courier job retries 3 times

**Given** a `match-courier` job fails (e.g., no couriers available)
**When** the job processor throws an error
**Then** BullMQ re-enqueues the job for retry
**And** the job retries up to 3 total attempts (initial + 2 retries)
**And** each retry uses exponential backoff starting at 1000ms

#### Scenario: Exponential backoff delays are correct

**Given** a `match-courier` job is configured with exponential backoff
**When** the retry delays are calculated
**Then** the first retry delay is approximately 1000ms
**And** the second retry delay is approximately 2000ms
**And** the backoff formula is `delay * 2^(attemptNumber - 1)`

#### Scenario: Job fails permanently after max retries

**Given** a `match-courier` job has failed 3 times
**When** the third attempt also fails
**Then** the job is marked as permanently failed
**And** the job is moved to the failed jobs set
**And** the order status remains `PENDING`
**And** the failure is logged with the full error context

#### Scenario: Successful job does not retry

**Given** a `match-courier` job succeeds on the first attempt
**When** the job processor completes without error
**Then** the job is marked as completed
**And** NO retry is scheduled
**And** the job is removed according to `removeOnComplete` settings

### REQ-4: Job Cancellation on Order Status Change

The system SHALL cancel pending jobs when an order's state makes them irrelevant.

#### Scenario: Expire-order job is cancelled when order is accepted

**Given** an `expire-order` job is pending in the queue (delay not yet elapsed)
**When** the order status changes from `PENDING` to `ACCEPTED` (via match-courier job)
**Then** the system SHOULD attempt to cancel the pending `expire-order` job
**And** if cancellation succeeds, the job is removed from the queue
**And** if cancellation fails (job already started), the worker checks status and skips (REQ-2)

#### Scenario: Match-courier job is cancelled when order is cancelled manually

**Given** a `match-courier` job is pending or retrying
**When** the order is manually cancelled (e.g., by user or admin)
**Then** the system SHOULD attempt to cancel the pending `match-courier` job
**And** if cancellation succeeds, the job is removed from the queue
**And** if cancellation fails, the worker checks order status and skips assignment

### REQ-5: Order Lifecycle Events

The system SHALL emit events for all significant order state transitions.

#### Scenario: Order created event

**Given** a new order is created
**When** the order is persisted
**Then** the order starts with status `PENDING`
**And** the `created_at` timestamp is set
**And** the `courier_id` is `null`

#### Scenario: Order accepted event

**Given** a `match-courier` job successfully assigns a courier
**When** the order is updated
**Then** the status changes from `PENDING` to `ACCEPTED`
**And** the `courier_id` is set to the assigned courier's UUID
**And** a `COURIER_ASSIGNED` event is published to Pub/Sub

#### Scenario: Order cancelled event

**Given** an `expire-order` job fires for a pending order
**When** the order is updated
**Then** the status changes from `PENDING` to `CANCELLED`
**And** the `courier_id` remains `null`
**And** an `ORDER_EXPIRED` event is published to Pub/Sub

#### Scenario: SSE subscribers receive lifecycle events

**Given** a client is connected to `GET /orders/:id/stream`
**When** any lifecycle event occurs for that order
**Then** the client receives an SSE event within 1 second of the event
**And** the event contains the new status and relevant metadata
