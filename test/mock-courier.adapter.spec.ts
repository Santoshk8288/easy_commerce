import { ConfigService } from '@nestjs/config';
import { MockCourierAdapter } from '../src/couriers/mock/mock-courier.adapter';
import { CreateOrderDto } from '../src/orders/dto/create-order.dto';

const order = {
  orderId: 'test-1',
  courierPartner: 'mock',
  metadata: {},
} as CreateOrderDto;

describe('MockCourierAdapter', () => {
  const config = {
    get: jest.fn().mockReturnValue(0),
  } as unknown as ConfigService;
  const adapter = new MockCourierAdapter(config);

  it('supports create, track and cancel', async () => {
    const created = await adapter.createShipment(order);
    expect(created.status).toBe('CREATED');
    expect(created.awbNumber).toMatch(/^MOCK/);

    const tracked = await adapter.trackShipment(created.awbNumber);
    expect(tracked.status).toBe('CREATED');

    const cancelled = await adapter.cancelShipment(created.awbNumber);
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('can simulate a normalized courier rejection', async () => {
    await expect(
      adapter.createShipment({
        ...order,
        orderId: 'test-2',
        metadata: { forceFailure: true },
      }),
    ).rejects.toMatchObject({ code: 'COURIER_REJECTED', httpStatus: 422 });
  });
});
