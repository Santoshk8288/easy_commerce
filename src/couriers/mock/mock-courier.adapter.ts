import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CourierError } from '../../common/errors/domain.error';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import {
  CourierAdapter,
  CourierCancelResult,
  CourierCreateResult,
  CourierTrackingResult,
} from '../courier.types';

@Injectable()
export class MockCourierAdapter implements CourierAdapter {
  readonly partner = 'mock';
  private readonly shipments = new Map<
    string,
    { status: 'CREATED' | 'CANCELLED'; createdAt: Date }
  >();

  constructor(private readonly config: ConfigService) {}

  async createShipment(order: CreateOrderDto): Promise<CourierCreateResult> {
    await this.delay();
    if (order.metadata?.forceFailure === true) {
      throw new CourierError(
        'COURIER_REJECTED',
        'Courier rejected the shipment',
        422,
        false,
        {
          reason: 'Forced mock failure',
        },
      );
    }
    const awbNumber = `MOCK${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const shipmentId = `mock-${randomUUID()}`;
    const rawResponse = {
      success: true,
      shipmentId,
      awb: awbNumber,
      status: 'CREATED',
    };
    this.shipments.set(awbNumber, { status: 'CREATED', createdAt: new Date() });
    return {
      shipmentId,
      awbNumber,
      status: 'CREATED',
      requestPayload: order,
      rawResponse,
    };
  }

  async trackShipment(awbNumber: string): Promise<CourierTrackingResult> {
    await this.delay();
    const shipment = this.shipments.get(awbNumber);
    if (!shipment)
      throw new CourierError(
        'SHIPMENT_NOT_FOUND',
        'Shipment was not found',
        404,
      );
    const rawResponse = {
      awb: awbNumber,
      status: shipment.status,
      events: [
        {
          status: shipment.status,
          timestamp: shipment.createdAt.toISOString(),
        },
      ],
    };
    return {
      status: shipment.status,
      events: [
        {
          status: shipment.status,
          occurredAt: shipment.createdAt,
          rawPayload: rawResponse.events[0],
        },
      ],
      rawResponse,
    };
  }

  async cancelShipment(awbNumber: string): Promise<CourierCancelResult> {
    await this.delay();
    const shipment = this.shipments.get(awbNumber);
    if (!shipment)
      throw new CourierError(
        'SHIPMENT_NOT_FOUND',
        'Shipment was not found',
        404,
      );
    shipment.status = 'CANCELLED';
    return {
      status: 'CANCELLED',
      rawResponse: { success: true, awb: awbNumber, status: 'CANCELLED' },
    };
  }

  private async delay() {
    const duration = this.config.get<number>('MOCK_COURIER_DELAY_MS', 20);
    await new Promise((resolve) => setTimeout(resolve, duration));
  }
}
