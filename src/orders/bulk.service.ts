import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { BatchItemStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DomainError } from '../common/errors/domain.error';
import { CourierRegistry } from '../couriers/courier-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateDto } from './dto/bulk-create.dto';
import { CreateOrderDto } from './dto/create-order.dto';

export const BULK_ORDER_QUEUE = 'bulk-orders';
export interface BulkOrderJob {
  batchId: string;
  itemId: string;
  order: CreateOrderDto;
}

@Injectable()
export class BulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couriers: CourierRegistry,
    @InjectQueue(BULK_ORDER_QUEUE) private readonly queue: Queue<BulkOrderJob>,
  ) {}

  async create(dto: BulkCreateDto) {
    const ids = dto.orders.map((order) => order.orderId);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) {
      throw new DomainError(
        'DUPLICATE_ORDER_IDS',
        'A bulk request cannot contain duplicate order IDs',
        400,
        {
          orderIds: [...new Set(duplicates)],
        },
      );
    }
    dto.orders.forEach((order) => this.couriers.get(order.courierPartner));

    const batch = await this.prisma.bulkBatch.create({
      data: {
        totalCount: dto.orders.length,
        items: {
          create: dto.orders.map((order) => ({
            externalOrderId: order.orderId,
            courierPartner: order.courierPartner.toLowerCase(),
          })),
        },
      },
      include: { items: true },
    });

    const ordersById = new Map(
      dto.orders.map((order) => [order.orderId, order]),
    );
    try {
      await this.queue.addBulk(
        batch.items.map((item) => ({
          name: 'create-order',
          data: {
            batchId: batch.id,
            itemId: item.id,
            order: ordersById.get(item.externalOrderId)!,
          },
          opts: { jobId: item.id, attempts: 1 },
        })),
      );
    } catch {
      await this.prisma.$transaction([
        this.prisma.bulkBatchItem.updateMany({
          where: { batchId: batch.id },
          data: {
            status: 'FAILED',
            errorCode: 'QUEUE_UNAVAILABLE',
            errorMessage: 'Bulk processing queue is unavailable',
          },
        }),
        this.prisma.bulkBatch.update({
          where: { id: batch.id },
          data: {
            status: 'COMPLETED',
            failureCount: batch.totalCount,
          },
        }),
      ]);
      throw new DomainError(
        'QUEUE_UNAVAILABLE',
        'Bulk processing queue is unavailable',
        503,
        { batchId: batch.id },
        true,
      );
    }

    return {
      batchId: batch.id,
      status: batch.status,
      totalCount: batch.totalCount,
      statusUrl: `/api/v1/orders/bulk/${batch.id}`,
      createdAt: batch.createdAt,
    };
  }

  async get(batchId: string) {
    const batch = await this.prisma.bulkBatch.findUnique({
      where: { id: batchId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!batch)
      throw new DomainError(
        'BATCH_NOT_FOUND',
        `Batch ${batchId} was not found`,
        404,
      );
    return {
      batchId: batch.id,
      status: batch.status,
      totalCount: batch.totalCount,
      successCount: batch.successCount,
      failureCount: batch.failureCount,
      pendingCount: batch.totalCount - batch.successCount - batch.failureCount,
      items: batch.items.map((item) => ({
        orderId: item.externalOrderId,
        courierPartner: item.courierPartner,
        status: item.status,
        ...(item.errorCode
          ? { error: { code: item.errorCode, message: item.errorMessage } }
          : {}),
      })),
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  async refreshCounts(batchId: string) {
    const groups = await this.prisma.bulkBatchItem.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { _all: true },
    });
    const count = (status: BatchItemStatus) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    const successCount = count('SUCCEEDED');
    const failureCount = count('FAILED');
    const remaining = count('QUEUED') + count('PROCESSING');
    if (remaining === 0) {
      await this.prisma.bulkBatch.update({
        where: { id: batchId },
        data: { successCount, failureCount, status: 'COMPLETED' },
      });
      return;
    }
    await this.prisma.bulkBatch.updateMany({
      where: { id: batchId, status: { not: 'COMPLETED' } },
      data: { successCount, failureCount, status: 'PROCESSING' },
    });
  }
}
