import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { COURIER_ADAPTERS } from './courier.types';
import { CourierRegistry } from './courier-registry.service';
import { MockCourierAdapter } from './mock/mock-courier.adapter';
import { UrbaneboltAdapter } from './urbanebolt/urbanebolt.adapter';

@Module({
  imports: [HttpModule],
  providers: [
    UrbaneboltAdapter,
    MockCourierAdapter,
    {
      provide: COURIER_ADAPTERS,
      useFactory: (urbanebolt: UrbaneboltAdapter, mock: MockCourierAdapter) => [
        urbanebolt,
        mock,
      ],
      inject: [UrbaneboltAdapter, MockCourierAdapter],
    },
    CourierRegistry,
  ],
  exports: [CourierRegistry],
})
export class CouriersModule {}
