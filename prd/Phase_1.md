**Project:** SwiftShip **Phase 1:** Backend Foundation (API & Persistence) **Focus:** Infrastructure, Relational Data, and API Documentation

---
## 1. Objective
The primary goal of Phase 1 is to establish the core backend infrastructure for the SwiftShip application. This phase delivers a containerized environment, a robust relational database with safe migration practices, foundational API endpoints for authentication and order management, and a standardized testing collection. This foundation ensures seamless handoffs for mobile integration and background job queuing in subsequent phases.
## 2. Technical Stack
- **Framework:** NestJS
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Containerization:** Docker & Docker Compose
- **API Client / Testing:** Bruno
---
## 3. Infrastructure & Architecture Requirements
### 3.1 Containerization
- **Requirement:** The application must be fully containerized to ensure consistency across local and production environments.
- **Implementation:** * Create a `docker-compose.yml` file.
    - Define two primary services: `api` (NestJS application) and `db` (PostgreSQL).
    - Configure environment variables for database credentials and application ports using a `.env` file.
    - Ensure the NestJS service waits for the PostgreSQL database to be ready before initializing.
### 3.2 Database & ORM Configuration
- **Requirement:** Safe, trackable database schema management.
- **Implementation:**
    - Integrate TypeORM with the NestJS application.
    - **Strict Constraint:** `synchronize: true` must be strictly disabled in all environments to prevent accidental data loss.
    - Implement TypeORM migrations to handle all database schema creations and updates.
    - Create npm scripts to generate, run, and revert migrations easily.
---
## 4. Data Models & Schema
The following core entities must be defined via TypeORM entities and deployed via migrations:

| Entity      | Description                          | Core Fields (Suggested)                                                                                                                                                           |
| ----------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**    | Customers placing delivery requests. | `id` (UUID), `email`, `password_hash`, `full_name`, `phone_number`, `created_at`                                                                                                  |
| **Courier** | Drivers accepting delivery requests. | `id` (UUID), `email`, `password_hash`, `full_name`, `vehicle_type`, `is_active`, `created_at`                                                                                     |
| **Order**   | The delivery request itself.         | `id` (UUID), `user_id` (FK), `courier_id` (FK, nullable), `pickup_address`, `dropoff_address`, `status` (Enum: PENDING, ACCEPTED, IN_TRANSIT, DELIVERED, CANCELLED), `created_at` |
_(Note: Depending on your specific design, User and Courier could be merged into a single table with a `Role` enum, but they must be logically distinct schemas)._

---
## 5. API Requirements
Develop RESTful CRUD endpoints utilizing NestJS controllers and services.
### 5.1 Authentication Module
- **POST `/auth/register/user`**: Create a new customer account. Passwords must be hashed (e.g., using bcrypt) before saving.
- **POST `/auth/register/courier`**: Create a new courier account.
- **POST `/auth/login`**: Authenticate credentials and return a JWT (JSON Web Token) for subsequent API requests.
### 5.2 Order Module
_(Endpoints should be protected by JWT authentication guards)_
- **POST `/orders`**: Create a new delivery request. (Requires Customer Auth).
- **GET `/orders`**: Retrieve a list of orders. (Customers see their own; Couriers see available/assigned).
- **GET `/orders/:id`**: Retrieve specific details of a single order.
- **PATCH `/orders/:id`**: Update order details or status (e.g., Courier accepting an order, updating status to `IN_TRANSIT`).
---
## 6. Testing & Documentation
### 6.1 Bruno Collection
- **Requirement:** Maintain an up-to-date API testing suite replacing Postman/Insomnia.
- **Implementation:**
    - Create a `bruno` directory within the repository containing the collection configuration.
    - Document every endpoint listed in Section 5 with sample request bodies and headers.
    - **Environments:** Configure at least two environments within Bruno:
        - `Local`: Targeting `http://localhost:<PORT>`
        - `Production`: Targeting the future production URL.
    - Implement Bruno scripting to automatically capture the JWT from the Login endpoint and apply it as a Bearer token to subsequent Order requests.
---
## 7. Acceptance Criteria (Definition of Done)
- [ ] Running `docker-compose up` successfully boots both PostgreSQL and the NestJS application without errors.
- [ ] Database schema is entirely generated by TypeORM migrations (`synchronize` is verified to be `false`).
- [ ] A new user and courier can be registered and logged in successfully.
- [ ] An authenticated user can create, view, and update an Order.
- [ ] The Bruno collection is committed to the repository.
- [ ] All API calls in the Bruno `Local` environment execute successfully and return the expected HTTP status codes (e.g., 200, 201, 401).
