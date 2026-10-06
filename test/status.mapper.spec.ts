import { normalizeShipmentStatus } from '../src/couriers/status.mapper';

describe('normalizeShipmentStatus', () => {
  it.each([
    ['manifested', 'CREATED'],
    ['Picked Up', 'PICKED_UP'],
    ['in-transit', 'IN_TRANSIT'],
    ['OFD', 'OUT_FOR_DELIVERY'],
    ['DEL', 'DELIVERED'],
    ['canceled', 'CANCELLED'],
    ['unexpected status', 'UNKNOWN'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeShipmentStatus(input)).toBe(expected);
  });
});
