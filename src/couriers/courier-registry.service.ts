import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error';
import { COURIER_ADAPTERS, CourierAdapter } from './courier.types';

@Injectable()
export class CourierRegistry {
  private readonly adapters: Map<string, CourierAdapter>;

  constructor(@Inject(COURIER_ADAPTERS) adapters: CourierAdapter[]) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.partner.toLowerCase(), adapter]),
    );
  }

  get(partner: string) {
    const adapter = this.adapters.get(partner.toLowerCase());
    if (!adapter) {
      throw new DomainError(
        'UNKNOWN_COURIER',
        `Unsupported courier partner: ${partner}`,
        400,
        { supportedCouriers: this.supported() },
      );
    }
    return adapter;
  }

  supported() {
    return [...this.adapters.keys()].sort();
  }
}
