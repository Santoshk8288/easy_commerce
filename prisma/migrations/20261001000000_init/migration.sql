CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED', 'UNKNOWN');
CREATE TYPE "BatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED');
CREATE TYPE "BatchItemStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "order_id" TEXT NOT NULL,
  "courier_partner" TEXT NOT NULL,
  "courier_shipment_id" TEXT,
  "awb_number" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "request_payload" JSONB NOT NULL,
  "courier_request" JSONB,
  "courier_response" JSONB,
  "last_error_code" TEXT,
  "last_error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tracking_events" (
  "id" BIGSERIAL NOT NULL,
  "order_id" UUID NOT NULL,
  "status" "ShipmentStatus" NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bulk_batches" (
  "id" UUID NOT NULL,
  "status" "BatchStatus" NOT NULL DEFAULT 'QUEUED',
  "total_count" INTEGER NOT NULL,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bulk_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bulk_batch_items" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "order_record_id" UUID,
  "external_order_id" TEXT NOT NULL,
  "courier_partner" TEXT NOT NULL,
  "status" "BatchItemStatus" NOT NULL DEFAULT 'QUEUED',
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bulk_batch_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_order_id_key" ON "orders"("order_id");
CREATE INDEX "orders_courier_partner_idx" ON "orders"("courier_partner");
CREATE INDEX "orders_awb_number_idx" ON "orders"("awb_number");
CREATE INDEX "tracking_events_order_id_occurred_at_idx" ON "tracking_events"("order_id", "occurred_at");
CREATE UNIQUE INDEX "bulk_batch_items_batch_id_external_order_id_key" ON "bulk_batch_items"("batch_id", "external_order_id");
CREATE INDEX "bulk_batch_items_batch_id_status_idx" ON "bulk_batch_items"("batch_id", "status");

ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_batch_items" ADD CONSTRAINT "bulk_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "bulk_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bulk_batch_items" ADD CONSTRAINT "bulk_batch_items_order_record_id_fkey" FOREIGN KEY ("order_record_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce append-only tracking history at the database boundary.
CREATE FUNCTION prevent_tracking_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tracking_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracking_events_no_update
BEFORE UPDATE OR DELETE ON "tracking_events"
FOR EACH ROW EXECUTE FUNCTION prevent_tracking_event_mutation();
