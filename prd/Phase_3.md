## 1. Executive Summary
**Phase 3** shifts the focus from the backend infrastructure to the mobile ecosystem. The goal is to establish a robust, scalable architecture for the **SwiftShip** mobile application using React Native and Expo. This phase bridges the gap between the server-side logic developed in Phases 1 and 2 and the end-user experience, prioritizing state management and efficient data fetching.

--- 
## 2. Technical Stack
- **Framework:** React Native (Expo SDK)
- **State Management:** Redux Toolkit (RTK)
- **Data Fetching:** RTK Query
- **Bundler:** Metro
- **Navigation:** React Navigation (Stack and Tab patterns)
---
## 3. Functional Requirements
### 3.1. Customer View: Order Creation
- **Request Form:** A multi-step or single-page form to input delivery details (pick-up/drop-off locations, package type, and urgency).
- **Validation:** Implementation of client-side validation to ensure all required fields are met before dispatching the request to the NestJS API.
- **Submission State:** Visual feedback (loaders/spinners) during the `POST /orders` request lifecycle.
### 3.2. Courier View: Order Management
- **Incoming Requests:** A real-time (via RTK Query polling or SSE) list of available delivery requests.
- **Action Logic:** Buttons to **Accept** or **Reject** orders.
    - Accepting an order updates the global state and shifts the view to an "Active Delivery" mode.
    - Rejecting an order removes the item from the local view.
### 3.3. Global State & Caching
- **Unified Store:** Use Redux to manage authentication tokens, user roles (Customer vs. Courier), and persistent settings.
- **RTK Query Integration:**
    - Auto-caching of order lists to prevent redundant network calls.
    - Optimistic updates for order acceptance to provide a "snappy" UI feel.
---
## 4. Technical Requirements & Architecture
### 4.1. Project Initialization
- Setup a `mobile/` directory within the monorepo.
- Configure **Metro** for optimal asset resolution and fast refresh during development.
- Establish a directory structure: `/src/features`, `/src/store`, `/src/components`, and `/src/services`.
### 4.2. RTK Query Configuration
- Define a `baseApi` with a `baseUrl` pointing to the NestJS backend (considering Docker network mapping for local testing).
- Implement `tagTypes` (e.g., `'Order'`) to enable automatic cache invalidation when a courier accepts a job or a customer creates one.
---
## 5. User Interface (UI) Requirements
- **Shared Components:** Reusable buttons, inputs, and card layouts to maintain visual consistency across both app roles.
- **Stateful Buttons:** The "Accept" button must transition to a loading state to prevent "double-tap" duplicate requests.
- **Theming:** Basic styling foundation using StyleSheet or a utility-first library to handle light/dark modes.
---
## 6. Success Metrics & Learning Objectives
- **Metro Performance:** Achieve a cold-boot time of under 10 seconds for the development bundler.
- **State Predictability:** 100% of API-driven UI changes must flow through Redux/RTK Query rather than local `useState` hooks for core business logic.
- **Cross-Role Fluidity:** A single build should handle the conditional rendering logic required to switch between "Customer" and "Courier" interfaces based on the logged-in user profile.
