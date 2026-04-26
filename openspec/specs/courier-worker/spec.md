# Capability: courier-worker

BullMQ worker that processes match-courier jobs, simulates courier assignment, updates the database, and publishes events via Pub/Sub.

## Requirements

### REQ-1: BullMQ Worker Setup

The system SHALL provide a NestJS module that creates and manages a BullMQ Worker instance.

#### Scenario: CourierWorkerModule registers the worker

**Given** the application imports `CourierWorkerModule`
**When** the module initializes
**Then** it creates a BullMQ `Worker` instance for the `dispatch` queue
**And** the worker connects to Redis using the shared `REDIS_CLIENT`
**And** the worker is configured with a concurrency of `1` (sequential processing)

#### Scenario: Worker registers job processors

**Given** the CourierWorker is initialized
**When** the module starts
**Then** it registers a processor function for `match-courier` jobs
**And** it registers a processor function for `expire-order` jobs
**And** each processor is a separate method or handler

#### Scenario: Worker shuts down gracefully

**Given** the application is shutting down (SIGTERM received)
**When** the `CourierWorkerModule` receives the shutdown signal
**Then** the worker calls `close()` to stop accepting new jobs
**And** it waits for the current job to complete (with a timeout)
**And** the worker releases its Redis connection

### REQ-2: Match-Courier Job Processing

The worker SHALL process `match-courier` jobs by simulating courier assignment.

#### Scenario: Match-courier job assigns a random available courier

**Given** a `match-courier` job is received by the worker
**When** the job processor executes
**Then** it queries the database for active couriers (`isActive = true`)
**And** it selects one courier at random from the available pool
**And** it updates the order's `courier_id` to the selected courier's ID
**And** it updates the order's `status` to `ACCEPTED`
**And** it simulates processing delay of approximately 3 seconds

#### Scenario: Match-courier job publishes completion event

**Given** a `match-courier` job successfully assigns a courier
**When** the database update completes
**Then** it publishes a message to the `order-updates` Pub/Sub channel
**And** the message contains: `{ orderId, event: 'COURIER_ASSIGNED', courierId, status: 'ACCEPTED', timestamp }`
**And** the message is a valid JSON string

#### Scenario: Match-courier job handles no available couriers

**Given** a `match-courier` job is processed
**When** no active couriers are found in the database
**Then** the job throws an error (will trigger retry via BullMQ)
**And** the order status remains `PENDING`
**And** NO event is published to Pub/Sub

#### Scenario: Match-courier job handles order not found

**Given** a `match-courier` job references an orderId
**When** the order does not exist in the database
**Then** the job throws a `NotFoundException`
**And** the job is marked as failed
**And** the failure is logged with the missing orderId

#### Scenario: Match-courier job handles database errors

**Given** a `match-courier` job is processing
**When** a database error occurs during the update
**Then** the job throws the error
**And** BullMQ retries the job according to the retry configuration
**And** the error is logged with context

### REQ-3: Expire-Order Job Processing

The worker SHALL process `expire-order` jobs by checking order status and cancelling if still pending.

#### Scenario: Expire-order job cancels pending order

**Given** an `expire-order` job is received by the worker
**When** the job processor executes
**Then** it fetches the order from the database by orderId
**And** it checks if the order status is `PENDING`
**And** if the status is `PENDING`, it updates the status to `CANCELLED`
**And** it publishes a message to `order-updates` with `{ orderId, event: 'ORDER_EXPIRED', status: 'CANCELLED', timestamp }`

#### Scenario: Expire-order job skips already-processed order

**Given** an `expire-order` job is received
**When** the order status is NOT `PENDING` (e.g., `ACCEPTED`, `IN_TRANSIT`)
**Then** the job completes without modifying the order
**And** NO event is published to Pub/Sub
**And** the job logs that the order was already processed

#### Scenario: Expire-order job handles missing order

**Given** an `expire-order` job references an orderId
**When** the order does not exist in the database
**Then** the job completes silently (no error, no retry)
**And** it logs a warning that the order was not found

### REQ-4: CourierWorker Service Structure

The `CourierWorkerService` SHALL encapsulate all worker processing logic.

#### Scenario: ProcessMatchCourier method exists

**Given** the `CourierWorkerService` is instantiated
**When** the worker receives a `match-courier` job
**Then** it calls `processMatchCourier(job.data)`
**And** the method returns a promise that resolves on success
**And** the method throws on failure (to trigger BullMQ retry)

#### Scenario: ProcessExpireOrder method exists

**Given** the `CourierWorkerService` is instantiated
**When** the worker receives an `expire-order` job
**Then** it calls `processExpireOrder(job.data)`
**And** the method returns a promise that resolves regardless of order state
**And** the method does NOT throw for already-processed orders

#### Scenario: Courier selection is encapsulated

**Given** courier assignment logic is needed
**When** `processMatchCourier` executes
**Then** it calls a private `selectRandomCourier()` method
**And** the method queries `Courier` entities where `isActive = true`
**And** it returns one courier at random using `Math.random()` or equivalent

### REQ-5: Pub/Sub Event Publishing

The worker SHALL publish events to Redis Pub/Sub after state changes.

#### Scenario: Event payload structure is consistent

**Given** any event is published to `order-updates`
**When** the event payload is inspected
**Then** it contains an `orderId` field (UUID string)
**And** it contains an `event` field (string identifier)
**And** it contains a `status` field (current OrderStatus)
**And** it contains a `timestamp` field (ISO 8601 string)
**And** it MAY contain additional fields specific to the event type

#### Scenario: Pub/Sub publish errors do not crash the worker

**Given** the worker attempts to publish an event
**When** the Pub/Sub publish fails (e.g., Redis connection lost)
**Then** the error is logged
**And** the job is NOT marked as failed (the DB update already succeeded)
**And** the worker continues processing subsequent jobs
