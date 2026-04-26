# Capability: dispatch-queue

BullMQ queue provider that produces jobs for courier matching and order expiration when orders are created.

## Requirements

### REQ-1: BullMQ Queue Provider

The system SHALL provide a NestJS module that wraps BullMQ's Queue class for job production.

#### Scenario: DispatchQueueModule registers the queue

**Given** the application imports `DispatchQueueModule`
**When** the module initializes
**Then** it creates a BullMQ `Queue` instance named `dispatch`
**And** the queue connects to Redis using the shared `REDIS_CLIENT`
**And** the queue is provided as an injectable token (`DISPATCH_QUEUE`)

#### Scenario: Queue uses default job options

**Given** the dispatch queue is configured
**When** a job is added without explicit options
**Then** the job uses default retry settings: 3 attempts
**And** the job uses exponential backoff with initial delay of 1000ms
**And** the job uses a default removeOnComplete of 100 (keep last 100 completed jobs)
**And** the job uses a default removeOnFail of 5000 (keep last 5000 failed jobs)

### REQ-2: Match-Courier Job Creation

The system SHALL enqueue a `match-courier` job when a new order is successfully created.

#### Scenario: Order creation enqueues match-courier job

**Given** a valid order creation request is received
**When** the order is successfully persisted to the database
**Then** a `match-courier` job is enqueued to the dispatch queue
**And** the job payload includes the `orderId` (UUID)
**And** the job payload includes the `pickupAddress` and `dropoffAddress`
**And** the job is named `match-courier`

#### Scenario: Match-courier job has retry configuration

**Given** a `match-courier` job is enqueued
**When** the job options are inspected
**Then** `attempts` is set to `3`
**And** `backoff` is set to `{ type: 'exponential', delay: 1000 }`
**And** the job will retry on failure up to 3 times with increasing delays

#### Scenario: Order creation failure does not enqueue job

**Given** an order creation request fails validation or authorization
**When** the request returns an error response
**Then** NO `match-courier` job is enqueued
**And** the database transaction is not committed

#### Scenario: Match-courier job payload is minimal

**Given** a `match-courier` job is created
**When** the job payload is inspected
**Then** it contains only the data needed for processing (orderId, addresses)
**And** it does NOT contain the full order entity or user data
**And** the worker fetches additional data from the database if needed

### REQ-3: Expire-Order Job Creation

The system SHALL enqueue a delayed `expire-order` job when a new order is created.

#### Scenario: Order creation enqueues expire-order job with delay

**Given** a valid order is successfully created
**When** the order creation completes
**Then** an `expire-order` job is enqueued to the dispatch queue
**And** the job payload includes the `orderId` (UUID)
**And** the job has a `delay` of `600_000` milliseconds (10 minutes)
**And** the job is named `expire-order`

#### Scenario: Expire-order job has no retries

**Given** an `expire-order` job is enqueued
**When** the job options are inspected
**Then** `attempts` is set to `1` (no retries)
**And** the job executes once after the delay period

### REQ-4: DispatchQueue Service API

The `DispatchQueueService` SHALL expose methods for enqueuing jobs.

#### Scenario: enqueueMatchCourier method exists

**Given** the `DispatchQueueService` is injected
**When** `enqueueMatchCourier(orderId, pickupAddress, dropoffAddress)` is called
**Then** it adds a `match-courier` job to the queue
**And** it returns the BullMQ `Job` instance
**And** it handles queue connection errors gracefully

#### Scenario: enqueueExpireOrder method exists

**Given** the `DispatchQueueService` is injected
**When** `enqueueExpireOrder(orderId)` is called
**Then** it adds an `expire-order` job to the queue with the configured delay
**And** it returns the BullMQ `Job` instance
**And** it handles queue connection errors gracefully

### REQ-5: Integration with OrderService

The `OrderService` SHALL use the `DispatchQueueService` to enqueue jobs after order creation.

#### Scenario: OrderService enqueues both jobs on successful creation

**Given** `OrderService.create()` successfully saves an order
**When** the save operation completes
**Then** `DispatchQueueService.enqueueMatchCourier()` is called with the order data
**And** `DispatchQueueService.enqueueExpireOrder()` is called with the order ID
**And** both calls happen within the same method execution

#### Scenario: OrderService handles queue failure without breaking order creation

**Given** the Redis queue is temporarily unavailable
**When** `OrderService.create()` attempts to enqueue jobs after saving
**Then** the order is still persisted to the database
**And** the queue failure is logged as a warning
**And** the order creation returns a 201 response (order saved, queue is best-effort)
