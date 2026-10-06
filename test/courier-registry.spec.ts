import { CourierRegistry } from '../src/couriers/courier-registry.service';
import { CourierAdapter } from '../src/couriers/courier.types';

describe('CourierRegistry', () => {
  const adapter = { partner: 'Mock' } as CourierAdapter;
  const registry = new CourierRegistry([adapter]);

  it('resolves partners case-insensitively', () => {
    expect(registry.get('mOcK')).toBe(adapter);
  });

  it('returns supported couriers for an unknown partner', () => {
    expect(() => registry.get('missing')).toThrow(
      expect.objectContaining({
        code: 'UNKNOWN_COURIER',
        details: { supportedCouriers: ['mock'] },
      }),
    );
  });
});
