import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { UrbaneboltAdapter } from '../src/couriers/urbanebolt/urbanebolt.adapter';
import { CreateOrderDto } from '../src/orders/dto/create-order.dto';

const order = {
  orderId: 'uat-1',
  courierPartner: 'urbanebolt',
  shipper: {
    name: 'Warehouse',
    addressLine1: '12 MG Road',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122017',
    country: 'India',
    phone: '9876543210',
  },
  recipient: {
    name: 'Customer',
    addressLine1: '26 Market Road',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122001',
    country: 'India',
    phone: '9876543211',
  },
  parcel: { weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10, pieces: 1 },
  items: [{ sku: 'SKU-1', description: 'Book', quantity: 1, unitPrice: 100 }],
  paymentMode: 'PREPAID',
  declaredValue: 100,
  invoiceNumber: 'INV-1',
  invoiceDate: '2026-10-01',
} as CreateOrderDto;

function response(data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} },
  } as AxiosResponse;
}

function configService() {
  const values: Record<string, unknown> = {
    URBANEBOLT_BASE_URL: 'https://uat.example.test',
    URBANEBOLT_USERNAME: 'user',
    URBANEBOLT_PASSWORD: 'secret',
    URBANEBOLT_CUSTOMER_CODE: 'CUSTOMER-1',
    URBANEBOLT_TOKEN_TTL_SECONDS: 3300,
    COURIER_RETRY_COUNT: 0,
    COURIER_RETRY_BASE_DELAY_MS: 1,
    COURIER_TIMEOUT_MS: 100,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('UrbaneboltAdapter', () => {
  it('authenticates, maps the normalized manifest, and extracts shipment fields', async () => {
    const request = jest
      .fn()
      .mockReturnValueOnce(of(response({ token: 'token-1' })))
      .mockReturnValueOnce(
        of(response({ data: [{ awb: '299999999999', shipmentId: 'ship-1' }] })),
      );
    const adapter = new UrbaneboltAdapter(
      { request } as unknown as HttpService,
      configService(),
    );

    const result = await adapter.createShipment(order);

    expect(result).toMatchObject({
      awbNumber: '299999999999',
      shipmentId: 'ship-1',
      status: 'CREATED',
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: '/api/v1/services/manifest/',
        data: [
          expect.objectContaining({
            orderNumber: 'uat-1',
            customerCode: 'CUSTOMER-1',
            payMode: 'PPD',
          }),
        ],
      }),
    );
  });

  it('re-authenticates once after a protected request returns 401', async () => {
    const unauthorized = Object.assign(new AxiosError('Unauthorized'), {
      response: { status: 401, data: { detail: 'expired' } },
    });
    const request = jest
      .fn()
      .mockReturnValueOnce(of(response({ token: 'expired-token' })))
      .mockReturnValueOnce(throwError(() => unauthorized))
      .mockReturnValueOnce(of(response({ token: 'fresh-token' })))
      .mockReturnValueOnce(of(response({ status: 'in transit', history: [] })));
    const adapter = new UrbaneboltAdapter(
      { request } as unknown as HttpService,
      configService(),
    );

    await expect(adapter.trackShipment('AWB-1')).resolves.toMatchObject({
      status: 'IN_TRANSIT',
    });
    expect(request).toHaveBeenCalledTimes(4);
  });
});
