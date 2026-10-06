import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CourierError } from '../../common/errors/domain.error';
import { AddressDto } from '../../orders/dto/address.dto';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import {
  CourierAdapter,
  CourierCancelResult,
  CourierCreateResult,
  CourierTrackingEvent,
  CourierTrackingResult,
} from '../courier.types';
import { normalizeShipmentStatus } from '../status.mapper';

@Injectable()
export class UrbaneboltAdapter implements CourierAdapter {
  readonly partner = 'urbanebolt';
  private token?: { value: string; expiresAt: number };
  private authentication?: Promise<string>;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async createShipment(order: CreateOrderDto): Promise<CourierCreateResult> {
    const payload = [this.toManifest(order)];
    const response = await this.authorizedRequest({
      method: 'POST',
      url: '/api/v1/services/manifest/',
      data: payload,
    });
    const raw = response.data;
    const awb = this.findString(raw, [
      'awb',
      'awbNumber',
      'awb_number',
      'waybill',
    ]);
    const shipmentId = this.findString(raw, [
      'shipmentId',
      'shipment_id',
      'id',
      'orderId',
      'order_id',
    ]);
    if (!awb) {
      throw new CourierError(
        'COURIER_INVALID_RESPONSE',
        'Courier response did not include an AWB number',
        502,
        false,
        raw,
      );
    }
    return {
      shipmentId: shipmentId ?? awb,
      awbNumber: awb,
      status: 'CREATED',
      requestPayload: payload,
      rawResponse: raw,
    };
  }

  async trackShipment(awbNumber: string): Promise<CourierTrackingResult> {
    const response = await this.authorizedRequest({
      method: 'GET',
      url: '/api/v1/services/tracking-pub/',
      params: { awb: awbNumber },
    });
    const raw = response.data;
    const status = normalizeShipmentStatus(
      this.findString(raw, ['status', 'shipmentStatus', 'currentStatus']),
    );
    const events = this.extractEvents(raw, status);
    return { status, events, rawResponse: raw };
  }

  async cancelShipment(awbNumber: string): Promise<CourierCancelResult> {
    const response = await this.authorizedRequest({
      method: 'POST',
      url: '/api/v1/services/cancel/',
      data: { awbs: awbNumber },
    });
    return { status: 'CANCELLED', rawResponse: response.data };
  }

  private toManifest(order: CreateOrderDto) {
    const returned = order.returnAddress ?? order.shipper;
    const firstItem = order.items[0];
    return {
      customerCode: this.requiredConfig('URBANEBOLT_CUSTOMER_CODE'),
      orderNumber: order.orderId,
      declaredValue: order.declaredValue,
      itemDescription: order.items.map((item) => item.description).join(', '),
      collectableValue:
        order.paymentMode === 'COD'
          ? (order.collectableValue ?? order.declaredValue)
          : 0,
      height: order.parcel.heightCm,
      length: order.parcel.lengthCm,
      pieces: order.parcel.pieces,
      weight: order.parcel.weightKg,
      breadth: order.parcel.widthCm,
      serviceType: order.serviceType ?? 'NDD',
      payMode: order.paymentMode === 'COD' ? 'COD' : 'PPD',
      ...this.mapAddress('rtn', returned),
      ...this.mapAddress('shpr', order.shipper),
      ...this.mapAddress('cons', order.recipient),
      invoiceNumber: order.invoiceNumber,
      invoiceDate: order.invoiceDate.slice(0, 10),
      invoiceValue: order.declaredValue,
      itemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      itemSku: firstItem?.sku,
    };
  }

  private mapAddress(prefix: 'rtn' | 'shpr' | 'cons', address: AddressDto) {
    const title = prefix === 'cons' ? 'Home' : 'Seller';
    return {
      [`${prefix}City`]: address.city,
      [`${prefix}Name`]: address.name,
      [`${prefix}Email`]: address.email ?? '',
      [`${prefix}State`]: address.state,
      [`${prefix}Mobile`]: address.phone,
      [`${prefix}Address`]: [address.addressLine1, address.addressLine2]
        .filter(Boolean)
        .join(', '),
      [`${prefix}AddressType`]: title,
      [`${prefix}Country`]: address.country,
      [`${prefix}Pincode`]: Number(address.pincode),
    };
  }

  private async authorizedRequest(
    config: AxiosRequestConfig,
    reauthenticated = false,
  ): Promise<AxiosResponse> {
    const token = await this.getToken();
    try {
      return await this.requestWithRetry({
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      if (
        error instanceof AxiosError &&
        error.response?.status === 401 &&
        !reauthenticated
      ) {
        this.token = undefined;
        return this.authorizedRequest(config, true);
      }
      throw this.mapError(error, undefined, {
        method: config.method,
        url: config.url,
        data: config.data,
        params: config.params,
      });
    }
  }

  private async getToken() {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    if (!this.authentication)
      this.authentication = this.authenticate().finally(
        () => (this.authentication = undefined),
      );
    return this.authentication;
  }

  private async authenticate() {
    const response = await this.requestWithRetry({
      method: 'POST',
      url: '/api/v1/auth/getToken/',
      data: {
        username: this.requiredConfig('URBANEBOLT_USERNAME'),
        password: this.requiredConfig('URBANEBOLT_PASSWORD'),
      },
      headers: { 'Content-Type': 'application/json' },
    }).catch((error) => {
      throw this.mapError(error, 'COURIER_AUTH_FAILED');
    });
    const value = this.findString(response.data, [
      'token',
      'access',
      'accessToken',
      'access_token',
    ]);
    if (!value)
      throw new CourierError(
        'COURIER_AUTH_FAILED',
        'Courier authentication returned no token',
        502,
      );
    const ttl =
      this.config.get<number>('URBANEBOLT_TOKEN_TTL_SECONDS', 3300) * 1000;
    this.token = { value, expiresAt: Date.now() + ttl };
    return value;
  }

  private async requestWithRetry(
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse> {
    const retries = this.config.get<number>('COURIER_RETRY_COUNT', 3);
    const baseDelay = this.config.get<number>(
      'COURIER_RETRY_BASE_DELAY_MS',
      250,
    );
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await firstValueFrom(
          this.http.request({
            ...config,
            baseURL: this.config.getOrThrow<string>('URBANEBOLT_BASE_URL'),
            timeout: this.config.get<number>('COURIER_TIMEOUT_MS', 10000),
          }),
        );
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error) || attempt === retries) throw error;
        const jitter = Math.floor(Math.random() * baseDelay);
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * 2 ** attempt + jitter),
        );
      }
    }
    throw lastError;
  }

  private isTransient(error: unknown) {
    if (!(error instanceof AxiosError)) return false;
    return (
      !error.response ||
      error.response.status === 429 ||
      error.response.status >= 500
    );
  }

  private mapError(
    error: unknown,
    fallbackCode?: string,
    requestPayload?: unknown,
  ) {
    if (error instanceof CourierError) return error;
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (!status)
        return new CourierError(
          'COURIER_UNAVAILABLE',
          'Courier is unavailable',
          503,
          true,
          error.code,
          requestPayload,
        );
      if (status === 401 || status === 403)
        return new CourierError(
          fallbackCode ?? 'COURIER_AUTH_FAILED',
          'Courier authentication failed',
          502,
          false,
          error.response?.data,
          requestPayload,
        );
      if (status >= 400 && status < 500)
        return new CourierError(
          'COURIER_REJECTED',
          'Courier rejected the request',
          422,
          false,
          error.response?.data,
          requestPayload,
        );
      return new CourierError(
        'COURIER_UNAVAILABLE',
        'Courier is temporarily unavailable',
        503,
        true,
        error.response?.data,
        requestPayload,
      );
    }
    return new CourierError(
      fallbackCode ?? 'COURIER_UNAVAILABLE',
      'Courier request failed',
      503,
      true,
      undefined,
      requestPayload,
    );
  }

  private extractEvents(
    raw: unknown,
    fallbackStatus: ReturnType<typeof normalizeShipmentStatus>,
  ): CourierTrackingEvent[] {
    const candidate = this.findArray(raw, [
      'events',
      'history',
      'trackingHistory',
      'scans',
    ]);
    if (!candidate?.length)
      return [
        { status: fallbackStatus, occurredAt: new Date(), rawPayload: raw },
      ];
    return candidate.map((event) => ({
      status: normalizeShipmentStatus(
        this.findString(event, ['status', 'scanStatus', 'description']),
      ),
      occurredAt: this.parseDate(
        this.findString(event, ['timestamp', 'date', 'eventTime', 'createdAt']),
      ),
      rawPayload: event,
    }));
  }

  private parseDate(value?: string) {
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
  }

  private findString(value: unknown, keys: string[]): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = this.findString(entry, keys);
        if (found) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const found = record[key];
      if (typeof found === 'string' || typeof found === 'number')
        return String(found);
    }
    for (const nested of Object.values(record)) {
      const found = this.findString(nested, keys);
      if (found) return found;
    }
    return undefined;
  }

  private findArray(value: unknown, keys: string[]): unknown[] | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    for (const key of keys)
      if (Array.isArray(record[key])) return record[key] as unknown[];
    for (const nested of Object.values(record)) {
      const found = this.findArray(nested, keys);
      if (found) return found;
    }
    return undefined;
  }

  private requiredConfig(key: string) {
    const value = this.config.get<string>(key);
    if (!value)
      throw new CourierError(
        'COURIER_NOT_CONFIGURED',
        `Courier configuration is incomplete: ${key}`,
        503,
      );
    return value;
  }
}
