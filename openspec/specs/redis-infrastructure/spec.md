# Capability: redis-infrastructure

Redis connection management, Pub/Sub channels, and Docker service configuration for SwiftShip async infrastructure.

## Requirements

### REQ-1: Redis Docker Service

The system SHALL provide a Redis service in docker-compose that starts alongside the API and database.

#### Scenario: Redis service starts with docker-compose

**Given** the docker-compose.yml includes a Redis service definition
**When** `docker-compose up` is executed
**Then** the Redis container starts on the configured port
**And** the Redis service exposes port 6379 to the internal Docker network
**And** the Redis service has a named volume for data persistence

#### Scenario: Redis health check passes

**Given** the Redis service includes a health check configuration
**When** the Redis container is running
**Then** the health check `redis-cli ping` returns `PONG`
**And** the health check interval is 5 seconds
**And** the health check timeout is 5 seconds
**And** the health check allows 5 retries before marking unhealthy

#### Scenario: API depends on healthy Redis

**Given** the API service has a `depends_on` configuration for Redis
**When** docker-compose starts services
**Then** the API waits for Redis to be healthy before starting
**And** the API uses `condition: service_healthy` for the dependency

### REQ-2: Redis Connection Configuration

The application SHALL configure Redis connection parameters via environment variables and provide a NestJS module for connection management.

#### Scenario: Redis connection uses environment variables

**Given** the `.env` file contains Redis connection variables
**When** the application starts
**Then** `REDIS_HOST` is read for the Redis hostname (default: `redis`)
**And** `REDIS_PORT` is read for the Redis port (default: `6379`)
**And** `REDIS_PASSWORD` is read for the Redis password (default: empty string)
**And** `REDIS_DB` is read for the Redis database index (default: `0`)

#### Scenario: .env.example documents Redis variables

**Given** a developer clones the repository
**When** they read `.env.example`
**Then** it includes `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, and `REDIS_DB` entries
**And** each variable has a comment explaining its purpose

#### Scenario: RedisModule provides connection provider

**Given** the application imports `RedisModule`
**When** the module initializes
**Then** it creates an `ioredis` client instance using environment variables
**And** it provides the client as an injectable token (`REDIS_CLIENT`)
**And** the module is marked as global so other modules can inject the client

#### Scenario: Redis connection handles startup failure gracefully

**Given** the Redis service is unavailable at startup
**When** the application attempts to connect
**Then** the connection retries with exponential backoff
**And** the application logs a warning but does not crash
**And** the application continues retrying until connection succeeds

### REQ-3: Pub/Sub Channel Setup

The system SHALL establish a Redis Pub/Sub channel for inter-service communication between workers and the API.

#### Scenario: Pub/Sub channel name is configurable

**Given** the system uses Redis Pub/Sub for order updates
**When** the Pub/Sub service initializes
**Then** it uses the channel name `order-updates`
**And** the channel name is defined as a constant or configurable value

#### Scenario: Pub/Sub publisher sends messages

**Given** a component has access to the Redis client
**When** it publishes a message to the `order-updates` channel
**Then** the message is a JSON string containing at minimum `orderId` and `event` fields
**And** the publish operation returns the number of subscribers that received the message

#### Scenario: Pub/Sub subscriber receives messages

**Given** a subscriber is listening on the `order-updates` channel
**When** a message is published to that channel
**Then** the subscriber receives the message payload
**And** the subscriber can parse the JSON payload into a structured object

#### Scenario: Pub/Sub subscriber can be cleanly disconnected

**Given** an active Pub/Sub subscriber
**When** the subscriber's unsubscribe method is called
**Then** the subscriber stops receiving messages
**And** the underlying Redis connection is not closed (shared connection)
**And** no memory leaks occur from dangling event listeners

### REQ-4: Redis Dependencies

The project SHALL include the required npm packages for Redis integration.

#### Scenario: bullmq and ioredis are in package.json

**Given** the project dependencies are inspected
**When** `package.json` is read
**Then** `bullmq` is listed as a dependency
**And** `ioredis` is listed as a dependency
**And** `@types/ioredis` is NOT required (bullmq bundles its own ioredis types)
