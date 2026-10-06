# Design: Multi-Courier Integration Platform

## Architecture

The service uses NestJS with a ports-and-adapters design. Controllers expose one stable, courier-neutral HTTP contract. `OrdersService` owns the use cases and persistence; it depends only on `CourierRegistry`, which resolves a `CourierAdapter` by the request's `courierPartner`. Each adapter translates normalized DTOs to a vendor payload and translates vendor responses and statuses back to the domain model.

```text
HTTP -> Controller -> OrdersService -> CourierRegistry -> CourierAdapter -> Vendor API
                         |                                      |
                         +------------ PostgreSQL <-------------+

Bulk HTTP -> BulkBatch + BullMQ jobs -> concurrent workers -> OrdersService
```

This is the Strategy pattern (one strategy per courier) combined with a registry/factory. Adding a courier means implementing `CourierAdapter` and registering one provider in `CouriersModule`; routes, DTOs, orchestration and existing adapters stay unchanged. `MockCourierAdapter` proves the boundary without requiring external credentials.

## Data model

- `orders`: unique internal `order_id`, partner, vendor shipment ID, AWB, normalized status, original normalized request, exact outbound/received payloads, last normalized error, and timestamps.
- `tracking_events`: append-only status observations with occurrence time and raw courier payload. A PostgreSQL trigger rejects update/delete operations.
- `bulk_batches`: aggregate state and success/failure counters.
- `bulk_batch_items`: one row per submitted order with result or normalized failure. `(batch_id, external_order_id)` is unique.

The unique `orders.order_id` constraint is the final idempotency guard, including races between single and bulk requests. Existing orders are returned with `idempotent: true` and no second courier call.

## Reliability and error model

UrbaneBolt tokens are cached with a configurable TTL and authentication is coalesced to avoid a refresh stampede. A 401 clears the token, re-authenticates, and retries once. Network errors, timeouts, 429s and 5xx responses use bounded exponential backoff with jitter. Vendor 4xx responses are mapped to normalized errors; raw vendor responses are stored but never returned to API consumers.

Every endpoint uses:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} },
  "requestId": "...",
  "timestamp": "..."
}
```

Failures are logged with request ID, order ID, partner, error type and stack. A caller-provided `x-request-id` is preserved; otherwise the API generates one.

## Bulk choice and trade-offs

`POST /orders/bulk` persists a batch and returns `202` immediately. BullMQ workers process jobs concurrently with configurable concurrency; `GET /orders/bulk/{batchId}` exposes per-order outcomes. This keeps request latency independent of courier latency and survives API restarts because PostgreSQL and Redis hold state. It requires Redis and polling; production could add webhooks or server-sent events without changing order processing.

## Assumptions

- UrbaneBolt's published collection supplies request examples but no response schemas. The adapter defensively extracts common AWB, shipment ID, token, status and event field names; captured real UAT responses should be converted into contract tests before production rollout.
- Currency is the account's configured currency (normally INR); money is represented as decimal JSON numbers because the upstream API uses numbers.
- The external `orderId` is globally unique across partners.
- Tracking is refreshed on demand. Scheduled polling or courier webhooks can call the same persistence path later.
