import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { CourierError, DomainError } from '../common/errors/domain.error';
import { CourierRegistry } from '../couriers/courier-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly couriers: CourierRegistry,
  ) {}

  async create(dto: CreateOrderDto, requestId = 'background') {
    const adapter = this.couriers.get(dto.courierPartner);
    const existing = await this.prisma.order.findUnique({
      where: { orderId: dto.orderId },
    });
    if (existing) return this.toOrderResponse(existing, true);

    let order;
    try {
      order = await this.prisma.order.create({
        data: {
          orderId: dto.orderId,
          courierPartner: adapter.partner,
          requestPayload: this.json(dto),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.order.findUniqueOrThrow({
          where: { orderId: dto.orderId },
        });
        return this.toOrderResponse(concurrent, true);
      }
      throw error;
    }

    try {
      const result = await adapter.createShipment(dto);
      const updated = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.order.update({
          where: { id: order.id },
          data: {
            courierShipmentId: result.shipmentId,
            awbNumber: result.awbNumber,
            status: result.status,
            courierRequest: this.json(result.requestPayload),
            courierResponse: this.json(result.rawResponse),
          },
        });
        await transaction.trackingEvent.create({
          data: {
            orderId: order.id,
            status: result.status,
            occurredAt: new Date(),
            rawPayload: this.json(result.rawResponse),
          },
        });
        return saved;
      });
      return this.toOrderResponse(updated, false);
    } catch (error) {
      const courierError = this.asCourierError(error);
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'FAILED',
          courierRequest: this.json(courierError.requestPayload ?? dto),
          courierResponse: this.json(
            courierError.rawPayload ?? { code: courierError.code },
          ),
          lastErrorCode: courierError.code,
          lastErrorMessage: courierError.message,
        },
      });
      this.logger.error({
        requestId,
        orderId: dto.orderId,
        courierPartner: adapter.partner,
        errorType: courierError.code,
        stack: courierError.stack,
      });
      throw courierError;
    }
  }

  async track(orderId: string, requestId = 'unknown') {
    const order = await this.findOrder(orderId);
    if (!order.awbNumber) {
      throw new DomainError(
        'SHIPMENT_NOT_CREATED',
        'Order does not have an active shipment',
        409,
      );
    }
    const adapter = this.couriers.get(order.courierPartner);
    try {
      const tracking = await adapter.trackShipment(order.awbNumber);
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: tracking.status,
            courierResponse: this.json(tracking.rawResponse),
          },
        }),
        ...tracking.events.map((event) =>
          this.prisma.trackingEvent.create({
            data: {
              orderId: order.id,
              status: event.status,
              occurredAt: event.occurredAt,
              rawPayload: this.json(event.rawPayload),
            },
          }),
        ),
      ]);
      const history = await this.prisma.trackingEvent.findMany({
        where: { orderId: order.id },
        orderBy: { occurredAt: 'asc' },
      });
      return {
        orderId: order.orderId,
        courierPartner: order.courierPartner,
        awbNumber: order.awbNumber,
        status: tracking.status,
        history: history.map((event) => ({
          id: event.id.toString(),
          status: event.status,
          occurredAt: event.occurredAt,
        })),
      };
    } catch (error) {
      this.logCourierFailure(error, requestId, orderId, order.courierPartner);
      throw this.asCourierError(error);
    }
  }

  async cancel(orderId: string, dto: CancelOrderDto, requestId = 'unknown') {
    const order = await this.findOrder(orderId);
    if (dto.courierPartner.toLowerCase() !== order.courierPartner) {
      throw new DomainError(
        'COURIER_MISMATCH',
        'courierPartner does not match the order',
        409,
      );
    }
    if (!order.awbNumber)
      throw new DomainError(
        'SHIPMENT_NOT_CREATED',
        'Order does not have an active shipment',
        409,
      );
    const adapter = this.couriers.get(order.courierPartner);
    try {
      const result = await adapter.cancelShipment(order.awbNumber);
      const updated = await this.prisma.$transaction(async (transaction) => {
        const saved = await transaction.order.update({
          where: { id: order.id },
          data: {
            status: result.status,
            courierResponse: this.json(result.rawResponse),
          },
        });
        await transaction.trackingEvent.create({
          data: {
            orderId: order.id,
            status: result.status,
            occurredAt: new Date(),
            rawPayload: this.json(result.rawResponse),
          },
        });
        return saved;
      });
      return this.toOrderResponse(updated, false);
    } catch (error) {
      this.logCourierFailure(error, requestId, orderId, order.courierPartner);
      throw this.asCourierError(error);
    }
  }

  private async findOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { orderId } });
    if (!order)
      throw new DomainError(
        'ORDER_NOT_FOUND',
        `Order ${orderId} was not found`,
        404,
      );
    return order;
  }

  private toOrderResponse(
    order: {
      orderId: string;
      courierPartner: string;
      courierShipmentId: string | null;
      awbNumber: string | null;
      status: ShipmentStatus;
      createdAt: Date;
      updatedAt: Date;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
    },
    idempotent: boolean,
  ) {
    return {
      orderId: order.orderId,
      courierPartner: order.courierPartner,
      courierShipmentId: order.courierShipmentId,
      awbNumber: order.awbNumber,
      status: order.status,
      idempotent,
      ...(order.lastErrorCode
        ? {
            error: {
              code: order.lastErrorCode,
              message: order.lastErrorMessage,
            },
          }
        : {}),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private logCourierFailure(
    error: unknown,
    requestId: string,
    orderId: string,
    courierPartner: string,
  ) {
    const normalized = this.asCourierError(error);
    this.logger.error({
      requestId,
      orderId,
      courierPartner,
      errorType: normalized.code,
      stack: normalized.stack,
    });
  }

  private asCourierError(error: unknown) {
    return error instanceof CourierError
      ? error
      : new CourierError(
          'COURIER_UNAVAILABLE',
          'Courier request failed',
          503,
          true,
        );
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }
}
