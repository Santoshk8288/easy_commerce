import { ShipmentStatus } from '@prisma/client';

export function normalizeShipmentStatus(value: unknown): ShipmentStatus {
  const normalizedValue =
    typeof value === 'string' || typeof value === 'number' ? value : '';
  const status = String(normalizedValue)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (['CREATED', 'MANIFESTED', 'BOOKED', 'READY_TO_SHIP'].includes(status))
    return 'CREATED';
  if (['PICKED_UP', 'PICKUP_DONE', 'PICKED'].includes(status))
    return 'PICKED_UP';
  if (['IN_TRANSIT', 'TRANSIT', 'SHIPPED'].includes(status))
    return 'IN_TRANSIT';
  if (['OUT_FOR_DELIVERY', 'OFD'].includes(status)) return 'OUT_FOR_DELIVERY';
  if (['DELIVERED', 'DEL'].includes(status)) return 'DELIVERED';
  if (['CANCELLED', 'CANCELED', 'RTO_LOCKED'].includes(status))
    return 'CANCELLED';
  if (['FAILED', 'ERROR'].includes(status)) return 'FAILED';
  return 'UNKNOWN';
}
