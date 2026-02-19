# Real-Time SSE Notification System

A robust, containerized real-time notification service using Server-Sent Events (SSE). Features include persistent connections, event persistence in PostgreSQL, subscription management, and automatic event replay for reconnection reliability.

## Features

-   **Server-Sent Events (SSE)**: Unidirectional real-time event streaming.
-   **Event Persistence**: All events are stored in PostgreSQL for reliability and history.
-   **Event Replay**: Automatically resends missed events upon reconnection using `Last-Event-ID`.
-   **Subscription Management**: Users can subscribe/unsubscribe from specific channels.
-   **Heartbeat**: Periodic keep-alive signals to prevent connection timeouts.
-   **Dockerized**: Fully containerized with Docker Compose for easy setup.

## Prerequisites

-   Docker and Docker Compose

## Quick Start
1.  **Clone the repository**.
2.  **Start the services**:
    ```bash
    docker-compose up --build
    ```
    This will start the Node.js application (port 8080) and PostgreSQL database (port 5432). Database seeding is automatic.

## Configuration

Environment variables are defined in `.env.example` and set in `docker-compose.yml`.
-   `PORT`: Application port (default: 8080)
-   `DATABASE_URL`: PostgreSQL connection string

## API Documentation

### 1. Publish Event
Publish a notification to a specific channel.
-   **Endpoint**: `POST /api/events/publish`
-   **Body**:
    ```json
    {
      "channel": "alerts",
      "eventType": "SYSTEM_WARNING",
      "payload": { "message": "Disk usage high" }
    }
    ```
-   **Response**: `202 Accepted`

### 2. Subscribe to Channel
-   **Endpoint**: `POST /api/events/channels/subscribe`
-   **Body**: `{ "userId": 1, "channel": "alerts" }`
-   **Response**: `201 Created`

### 3. Unsubscribe
-   **Endpoint**: `POST /api/events/channels/unsubscribe`
-   **Body**: `{ "userId": 1, "channel": "alerts" }`
-   **Response**: `200 OK`

### 4. Stream Events (SSE)
Connect to the event stream.
-   **Endpoint**: `GET /api/events/stream`
-   **Query Params**:
    -   `userId`: ID of the user connecting.
    -   `channels`: Comma-separated list of channels (e.g., `alerts,general`).
-   **Example**:
    ```bash
    curl -N "http://localhost:8080/api/events/stream?userId=1&channels=alerts"
    ```
    *(Note: `-N` flag in curl disables buffering)*

### 5. Event History
Retrieve past events.
-   **Endpoint**: `GET /api/events/history`
-   **Query Params**: `channel`, `afterId` (optional), `limit` (optional).
-   **Example**: `GET /api/events/history?channel=alerts&limit=10`

## Testing

### Automated Verification Script
A Node.js script is included to verify all core functionality (Health, Subscribe, Publish, SSE options, Replay).
1.  Ensure the app is running (via Docker).
2.  Run the script (requires Node.js locally):
    ```bash
    node verify.js
    ```
    *(Note: You may need to `npm install` locally if dependencies are missing, but the script uses standard `http` module only).*

### Manual Testing with Curl

1.  **Subscribe User 1 to 'test'**:
    ```bash
    curl -X POST http://localhost:8080/api/events/channels/subscribe \
      -H "Content-Type: application/json" \
      -d '{"userId": 1, "channel": "test"}'
    ```

2.  **Listen for events**:
    Open a terminal and run:
    ```bash
    curl -N "http://localhost:8080/api/events/stream?userId=1&channels=test"
    ```

3.  **Publish an event**:
    Open another terminal and run:
    ```bash
    curl -X POST http://localhost:8080/api/events/publish \
      -H "Content-Type: application/json" \
      -d '{"channel": "test", "eventType": "PING", "payload": {"msg": "hello"}}'
    ```
    You should see the event appear in the first terminal.

4.  **Test Replay**:
    Stop the listener (Ctrl+C). Note the `id` of the received event (e.g., `15`).
    Reconnect with `Last-Event-ID`:
    ```bash
    curl -N -H "Last-Event-ID: 14" "http://localhost:8080/api/events/stream?userId=1&channels=test"
    ```
    You should immediately receive event `15`.

## Architecture
-   **Node.js/Express**: Handles API requests and manages SSE connections.
-   **PostgreSQL**: specific tables `events` and `user_subscriptions`.
-   **Mechanism**:
    -   **Live Updates**: In-memory mapping of active response streams.
    -   **Replay**: Queries `events` table for IDs > `Last-Event-ID`.
