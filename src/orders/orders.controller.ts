import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequestWithId } from '../common/middleware/request-id.middleware';
import { BulkService } from './bulk.service';
import { BulkCreateDto } from './dto/bulk-create.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly bulk: BulkService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create one courier shipment (idempotent by orderId)',
  })
  @ApiResponse({
    status: 201,
    description: 'Shipment created, or existing order returned',
  })
  create(@Body() dto: CreateOrderDto, @Req() request: RequestWithId) {
    return this.orders.create(dto, request.requestId);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue up to 100 orders for concurrent background processing',
  })
  createBulk(@Body() dto: BulkCreateDto) {
    return this.bulk.create(dto);
  }

  @Get('bulk/:batchId')
  @ApiOperation({ summary: 'Get per-order bulk processing results' })
  @ApiParam({ name: 'batchId', format: 'uuid' })
  getBulk(@Param('batchId') batchId: string) {
    return this.bulk.get(batchId);
  }

  @Get(':orderId/track')
  @ApiOperation({ summary: 'Refresh and return normalized tracking history' })
  track(@Param('orderId') orderId: string, @Req() request: RequestWithId) {
    return this.orders.track(orderId, request.requestId);
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a shipment before pickup' })
  cancel(
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
    @Req() request: RequestWithId,
  ) {
    return this.orders.cancel(orderId, dto, request.requestId);
  }
}
