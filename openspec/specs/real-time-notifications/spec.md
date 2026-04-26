# Capability: real-time-notifications

Server-Sent Events (SSE) endpoint that streams order status updates to clients via Redis Pub/Sub subscription.

## Requirements

### REQ-1: SSE Endpoint

The system SHALL provide an SSE endpoint for real-time order status updates.

#### Scenario: SSE endpoint is accessible

**Given** the OrderController is running
**When** a client sends `GET /orders/:id/stream`
**Then** the endpoint accepts the connection
**And** it responds with `Content-Type: text/event-stream`
**And** it responds with `Cache-Control: no-cache`
**And** it responds with `Connection: keep-alive`
**And** the HTTP status is `200`

#### Scenario: SSE endpoint requires authentication

**Given** an unauthenticated client requests the SSE endpoint
**When** `GET /orders/:id/stream` is called without a valid JWT
**Then** the response is `401 Unauthorized`
**And** the connection is NOT established

#### Scenario: SSE endpoint validates order ownership

**Given** an authenticated user requests the SSE endpoint for an order
**When** the user does not own the order AND is not the assigned courier
**Then** the response is `403 Forbidden`
**And** the connection is NOT established

#### Scenario: SSE endpoint validates order existence

**Given** a client requests the SSE endpoint for a non-existent order
**When** `GET /orders/:id/stream` is called with an invalid orderId
**Then** the response is `404 Not Found`
**And** the connection is NOT established

### REQ-2: Observable Stream from Pub/Sub

The SSE endpoint SHALL use an RxJS Observable that subscribes to Redis Pub/Sub.

#### Scenario: SSE subscribes to order-updates channel on connection

**Given** a valid SSE connection is established
**When** the Observable is created
**Then** it subscribes to the `order-updates` Redis Pub/Sub channel
**And** it filters messages to only those matching the requested `orderId`

#### Scenario: SSE emits events matching the order ID

**Given** the SSE Observable is subscribed to Pub/Sub
**When** a message is published to `order-updates` with a matching `orderId`
**Then** the Observable emits an SSE event to the client
**And** the event format is:
```
event: <event_type>
data: {"orderId":"...","status":"...","timestamp":"..."}
id: <unique_id>

```

#### Scenario: SSE ignores events for other orders

**Given** the SSE Observable is subscribed for order `order-A`
**When** a Pub/Sub message arrives for order `order-B`
**Then** the Observable does NOT emit an event
**And** the client connection remains open

#### Scenario: SSE sends initial connection event

**Given** a client connects to the SSE endpoint
**When** the connection is first established
**Then** an initial event is sent with `event: connected`
**And** the data contains the current order status from the database
**And** the data contains `{ orderId, status, message: "Connected to order stream" }`

### REQ-3: Client Disconnect Handling

The system SHALL properly clean up resources when an SSE client disconnects.

#### Scenario: Pub/Sub subscription is cleaned up on disconnect

**Given** an active SSE connection
**When** the client disconnects (closes the connection)
**Then** the RxJS Observable's `finalize` operator executes
**And** the Pub/Sub subscription is unsubscribed
**And** the Redis listener is removed from the `order-updates` channel

#### Scenario: No memory leak from disconnected clients

**Given** multiple clients have connected and disconnected from the SSE endpoint
**When** the application memory is inspected
**Then** there are no dangling Pub/Sub listeners
**And** there are no orphaned Observable subscriptions
**And** the Redis client connection count has not grown

#### Scenario: SSE handles abrupt client disconnection

**Given** an active SSE connection
**When** the client's network drops abruptly (no proper close)
**Then** the server detects the broken connection within the keep-alive timeout
**And** the cleanup logic executes (same as graceful disconnect)
**And** no errors are thrown in the server logs

### REQ-4: SSE Event Format

SSE events SHALL follow a consistent format for client consumption.

#### Scenario: COURIER_ASSIGNED event format

**Given** a courier is assigned to an order
**When** the SSE stream emits the event
**Then** the event name is `COURIER_ASSIGNED`
**And** the data JSON contains: `{ orderId, courierId, status: "ACCEPTED", timestamp }`

#### Scenario: ORDER_EXPIRED event format

**Given** an order expires and is cancelled
**When** the SSE stream emits the event
**Then** the event name is `ORDER_EXPIRED`
**And** the data JSON contains: `{ orderId, status: "CANCELLED", timestamp }`

#### Scenario: SSE event IDs are unique

**Given** multiple events are emitted on the same SSE stream
**When** each event is inspected
**Then** each event has a unique `id` field
**And** the ID is a monotonically increasing number or UUID

### REQ-5: SSE Endpoint Implementation

The SSE endpoint SHALL be implemented using NestJS decorators and RxJS.

#### Scenario: Endpoint uses @Sse() decorator

**Given** the OrderController defines the SSE endpoint
**When** the route handler is inspected
**Then** it uses the `@Sse('stream')` decorator (or `@Sse(':id/stream')`)
**And** it returns an `Observable<MessageEvent>`
**And** it accepts the order ID as a route parameter

#### Scenario: SSE endpoint is under orders route

**Given** the SSE endpoint is defined
**When** the full URL is constructed
**Then** the path is `/orders/:id/stream`
**And** it shares the `@Controller('orders')` prefix with other order endpoints
**And** it uses the same `JwtAuthGuard` for authentication
