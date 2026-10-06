import 'dotenv/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DomainError } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { BULK_ORDER_QUEUE, BulkOrderJob, BulkService } from './bulk.service';
import { OrdersService } from './orders.service';

@Processor(BULK_ORDER_QUEUE, {
  concurrency: Number(process.env.BULK_WORKER_CONCURRENCY ?? 10),
})
export class BulkProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkProcessor.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly bulk: BulkService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<BulkOrderJob>) {
    const { batchId, itemId, order } = job.data;
    await this.prisma.bulkBatchItem.update({
      where: { id: itemId },
      data: { status: 'PROCESSING' },
    });
    try {
      const result = await this.orders.create(
        order,
        `bulk:${batchId}:${job.id}`,
      );
      const orderRecord = await this.prisma.order.findUnique({
        where: { orderId: result.orderId },
      });
      await this.prisma.bulkBatchItem.update({
        where: { id: itemId },
        data: { status: 'SUCCEEDED', orderRecordId: orderRecord?.id },
      });
      return result;
    } catch (error) {
      const normalized =
        error instanceof DomainError
          ? error
          : new DomainError('INTERNAL_ERROR', 'Order processing failed', 500);
      await this.prisma.bulkBatchItem.update({
        where: { id: itemId },
        data: {
          status: 'FAILED',
          errorCode: normalized.code,
          errorMessage: normalized.message,
        },
      });
      this.logger.error({
        requestId: `bulk:${batchId}:${job.id}`,
        orderId: order.orderId,
        courierPartner: order.courierPartner,
        errorType: normalized.code,
        stack: normalized.stack,
      });
    } finally {
      await this.bulk.refreshCounts(batchId);
    }
  }
}
