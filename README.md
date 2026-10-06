# Easy Commerce Courier Platform

Production-oriented NestJS backend for a unified multi-courier API. It includes a real UrbaneBolt UAT adapter and a fully functional in-memory mock adapter.

## Stack

- Node.js 22, NestJS 11, TypeScript
- PostgreSQL + Prisma
- Redis + BullMQ for concurrent background batches
- Jest, class-validator, Swagger/OpenAPI

## Run locally

Prerequisites: Node.js 22+ and Docker Compose.

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npx prisma generate
npm run prisma:deploy
npm run start:dev
```

The API is at `http://localhost:3000/api/v1`, Swagger at `http://localhost:3000/docs`, and health at `GET /api/v1/health`.

For a credential-free smoke test, use `courierPartner: "mock"`. Set `metadata.forceFailure: true` to test partial bulk failures.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection URL | required |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | BullMQ connection | localhost / 6379 |
| `BULK_WORKER_CONCURRENCY` | Parallel jobs per worker | `10` |
| `COURIER_TIMEOUT_MS` | Vendor request timeout | `10000` |
| `COURIER_RETRY_COUNT` | Transient retry count | `3` |
| `COURIER_RETRY_BASE_DELAY_MS` | Exponential backoff base | `250` |
| `URBANEBOLT_BASE_URL` | UrbaneBolt API root | UAT URL |
| `URBANEBOLT_USERNAME`, `URBANEBOLT_PASSWORD` | API credentials | none |
| `URBANEBOLT_CUSTOMER_CODE` | Manifest customer code | none |
| `URBANEBOLT_TOKEN_TTL_SECONDS` | Local token cache TTL | `3300` |
| `MOCK_COURIER_DELAY_MS` | Mock latency | `20` |

Never commit `.env`. The credentials visible in UrbaneBolt's public example collection are intentionally not included.

## API

- `POST /api/v1/orders` - create synchronously; idempotent on `orderId`
- `GET /api/v1/orders/{orderId}/track` - refresh and return tracking history
- `POST /api/v1/orders/{orderId}/cancel` - cancel before pickup
- `POST /api/v1/orders/bulk` - queue 1-100 orders and return `202`
- `GET /api/v1/orders/bulk/{batchId}` - poll per-order results

Import [postman/easy-commerce.postman_collection.json](postman/easy-commerce.postman_collection.json) for ready-to-run examples. The collection stores returned order and batch IDs automatically.

## Test and quality checks

```bash
npm test
npm run test:cov
npm run lint
npm run build
```

Tests do not need PostgreSQL, Redis, or live courier credentials. For a full smoke test, start dependencies, deploy migrations, run the API, and execute the Postman collection with the mock courier.

## Add a courier

1. Implement `CourierAdapter` in `src/couriers/<partner>/`.
2. Translate `CreateOrderDto` into the partner payload and normalize create, track and cancel results.
3. Register the provider in `CouriersModule` and append it to the `COURIER_ADAPTERS` factory array.
4. Add contract tests with sanitized vendor fixtures.

No controller, route, normalized DTO, `OrdersService`, database schema, or existing adapter changes are required.

## Design notes

See [DESIGN.md](DESIGN.md) for architecture, schema, pattern choice, reliability behavior, assumptions and trade-offs.
