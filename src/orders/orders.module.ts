import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CouriersModule } from '../couriers/couriers.module';
import { BulkProcessor } from './bulk.processor';
import { BULK_ORDER_QUEUE, BulkService } from './bulk.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    CouriersModule,
    BullModule.registerQueue({ name: BULK_ORDER_QUEUE }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, BulkService, BulkProcessor],
})
export class OrdersModule {}
