**Project:** SwiftShip **Phase 2:** Async Infrastructure & Real-Time Notifications **Focus:** Message Brokering, Background Jobs, and Server-Sent Events (SSE)

---
## 1. Objective
Decouple heavy or time-sensitive processes from the main HTTP request loop using a message broker and job queue. Additionally, implement a real-time notification system using Server-Sent Events (SSE) so the mobile client is instantly updated when a courier is assigned, ensuring a seamless user experience without taxing the server with polling requests.
## 2. Technical Stack
- **Framework:** NestJS (Producer, Consumer, & SSE Controllers)
- **Message Broker / Datastore:** Redis (for both BullMQ and Pub/Sub)
- **Queue System:** BullMQ
- **Containerization:** Docker Compose
---
## 3. Infrastructure & Architecture Updates
### 3.1 Redis Integration
- **Requirement:** Provide a fast, in-memory datastore for job queues and inter-process messaging.
- **Implementation:**
    - Update `docker-compose.yml` to include a `redis` service.
    - Configure persistent storage (volumes) for Redis.
    - Map environment variables in the NestJS application (`.env`) to connect to the Redis instance.
### 3.2 Inter-Process Communication (Redis Pub/Sub)
- **Requirement:** The Worker processing the job needs a way to alert the main API thread that a task is complete.
- **Implementation:** * Implement Redis Pub/Sub within NestJS.
    - When the Worker finishes a job, it publishes a message to a specific channel (e.g., `order-updates`).
---
## 4. The Queue Ecosystem
### 4.1 The Producer (Dispatch Queue)
- **Requirement:** The API must delegate tasks to the background engine.
- **Implementation:**
    - Integrate BullMQ and create a `DispatchQueue` module.
    - Update the `POST /orders` endpoint: After saving a `PENDING` order to PostgreSQL, push a `match-courier` job onto the `DispatchQueue` and immediately return a 201 Created response.
### 4.2 The Consumer (Worker Service)
- **Requirement:** A dedicated background service that executes the business logic.
- **Implementation:**
    - Create a NestJS Worker class listening to the `DispatchQueue`.
    - **Simulated Logic:** The worker simulates a delay (e.g., 3 seconds), assigns an available courier to the order in PostgreSQL, and changes the status to `ACCEPTED`.
    - **Event Emission:** Upon successful database update, the Worker publishes an event payload via Redis Pub/Sub containing the `order_id`, `new_status`, and `courier_id`.
---
## 5. Real-Time Notifications (SSE)
### 5.1 SSE Endpoint
- **Requirement:** The client needs an endpoint to listen for server-pushed updates.
- **Implementation:**
    - Create a new endpoint: **GET `/orders/:id/stream`**.
    - Utilize the NestJS `@Sse()` decorator to return an `Observable`.
    - This endpoint will subscribe to the Redis Pub/Sub `order-updates` channel. When a message matching the requested `:id` is received, it streams the event to the connected client.
### 5.2 Delayed Jobs & Error Handling
- **Requirement:** Handle order expiration and transient failures.
- **Implementation:**
    - **Expiration:** Enqueue an `expire-order` delayed job (10 minutes) when an order is created. If the order is still `PENDING` when the job fires, cancel the order and emit a "Cancelled" SSE event.
    - **Retries:** Configure BullMQ to retry the `match-courier` job up to 3 times with exponential backoff if a failure occurs.
---
## 6. Acceptance Criteria (Definition of Done)
- [ ] `docker-compose up` boots PostgreSQL, NestJS API, and Redis successfully.
- [ ] Creating an order responds immediately via HTTP, queuing a background job.
- [ ] A client can connect to `GET /orders/:id/stream` and hold an open connection.
- [ ] When the background worker completes the matching process, the client receives an SSE payload with the updated order status, without needing to refresh.
- [ ] The Bruno collection is updated to include the new SSE endpoint (Bruno supports testing SSE streams).
- [ ] An order left `PENDING` automatically expires after 10 minutes, triggering an SSE update to the client indicating the cancellation.
