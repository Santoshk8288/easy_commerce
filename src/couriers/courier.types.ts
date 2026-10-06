import { ShipmentStatus } from '@prisma/client';
import { CreateOrderDto } from '../orders/dto/create-order.dto';

export interface CourierCreateResult {
  shipmentId: string;
  awbNumber: string;
  status: ShipmentStatus;
  requestPayload: unknown;
  rawResponse: unknown;
}

export interface CourierTrackingEvent {
  status: ShipmentStatus;
  occurredAt: Date;
  rawPayload: unknown;
}

export interface CourierTrackingResult {
  status: ShipmentStatus;
  events: CourierTrackingEvent[];
  rawResponse: unknown;
}

export interface CourierCancelResult {
  status: ShipmentStatus;
  rawResponse: unknown;
}

export interface CourierAdapter {
  readonly partner: string;
  createShipment(order: CreateOrderDto): Promise<CourierCreateResult>;
  trackShipment(awbNumber: string): Promise<CourierTrackingResult>;
  cancelShipment(awbNumber: string): Promise<CourierCancelResult>;
}

export const COURIER_ADAPTERS = Symbol('COURIER_ADAPTERS');
