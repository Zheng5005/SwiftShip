## Phase 1: Backend Foundation (API & Persistence)
**Focus:** Infrastructure, Relational Data, and API Documentation.
- **Technologies:** Docker, NestJS, PostgreSQL, TypeORM, Bruno.
- **Core Requirements:**
    - Containerize PostgreSQL and the NestJS app using **Docker Compose**.
    - Implement **TypeORM Migrations** (avoid `synchronize: true`) to define `User`, `Order`, and `Courier` schemas.
    - Build CRUD endpoints for Order creation and User authentication.
    - Create a **Bruno** collection with environments (Local vs. Prod) to test all endpoints.
- **Learning Objective:** Mastering the NestJS dependency injection system and structured database versioning.
## Phase 2: Async Infrastructure (The Background Engine)
**Focus:** Message Brokering and Asynchronous Job Processing.
- **Technologies:** Redis, BullMQ, NestJS.
- **Core Requirements:**
    - Add a **Redis** container to the Docker Compose file.
    - Implement a `DispatchQueue`: When an order is placed, a job is added to BullMQ.
    - Create a "Worker" service that simulates logic (e.g., matching a courier to an order) outside the main request loop.
    - Implement "Job Retries" and "Delayed Jobs" (e.g., expire an order if no courier accepts in 10 minutes).
- **Learning Objective:** Understanding the Producer-Consumer pattern and ensuring system reliability under load.
## Phase 3: Mobile Core (State & UI)
**Focus:** Mobile Architecture and Global State Management.
- **Technologies:** React Native, Expo, Metro, Redux Toolkit (RTK).
- **Core Requirements:**
    - Initialize the Expo project and configure the **Metro** bundler.
    - Setup **Redux Toolkit** and **RTK Query** for API communication (caching and polling order status).
    - Build the "Customer" view (Order Form) and "Courier" view (Accept/Reject Order).
- **Learning Objective:** Managing complex global states in mobile and optimizing the Metro build process.
## Phase 4: Mobile Advanced (Native & Linking)
**Focus:** Hardware Integration and OS-Level Interactions.
- **Technologies:** React Native, Expo Modules, Deep Linking.
- **Core Requirements:**
    - Implement **Deep Linking**: Allow users to share a link that opens the app directly to a specific `OrderDetails` screen.
    - **Native Process:** Use the Expo Modules API to write a custom native bridge (Swift/Kotlin) for a specific device feature (e.g., high-accuracy background location or custom haptics).
- **Learning Objective:** Bridging the gap between the JavaScript runtime and the underlying Mobile OS.
## Phase 5: Observability & Quality (Hardening)
**Focus:** Error Tracking, User Analytics, and Automated Testing.
- **Technologies:** Sentry, PostHog, Jest, E2E Testing (Maestro/Detox).
- **Core Requirements:**
    - Integrate **Sentry** in both Backend and Mobile to capture crashes and performance bottlenecks.
    - Setup **PostHog** to track user "funnels" (e.g., where users drop off during the order process).
    - Write **Unit Tests** for business logic and **Integration Tests** for API-to-DB flows.
    - Execute a full **E2E Test** covering the "Happy Path" (Order -> Dispatch -> Completion).
- **Learning Objective:** Moving from "it works" to "it's maintainable and observable."
## Phase 6: Deployment & DevOps
**Focus:** Production Environments and Cloud Scaling.
- **Technologies:** Render, Docker, Environment Management.
- **Core Requirements:**
    - Deploy the NestJS API to **Render** as a Web Service.
    - Deploy the BullMQ Worker to **Render** as a Background Worker (using the same codebase).
    - Provision a managed PostgreSQL and Redis instance on Render.
    - Configure production environment variables and SSL.
- **Learning Objective:** Handling the nuances of cloud deployment, secret management, and scaling background workers independently from the API.
### Directory Structure
```
/swiftship
  ├── /backend        # NestJS, TypeORM, BullMQ, Dockerfile
  ├── /mobile         # Expo, Redux, Native Modules, Sentry Config
  ├── /bruno          # API Request Collection
  └── README.md
```