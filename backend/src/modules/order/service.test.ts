import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createOrderWorkflowService } from './service.js';

class TestOrderWorkflowError extends Error {}

function toNonEmptyStringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function createService() {
  return createOrderWorkflowService({
    ORDER_NOTIFICATION_BY_STATUS: {},
    ORDER_STATUS_TRANSITIONS: {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
    },
    OrderWorkflowError: TestOrderWorkflowError,
    buildOrderNotificationEmailContent: () => ({
      subject: 'Test notification',
      text: 'Test notification',
      html: '<p>Test notification</p>',
    }),
    createShippingOrder: async () => null,
    crypto,
    ensureEmailPreference: async () => ({ transactionalOptIn: true }),
    ensureOrderWorkflowTables: async () => undefined,
    mapBoxtalStatus: () => null,
    normalizeShippingMode: () => null,
    prisma: {},
    queueEmailDelivery: async () => undefined,
    t: (key: string) => (key === 'backend.index.email' ? 'email' : key),
    toJsonObjectRecord: (value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {},
    toNonEmptyStringOrNull,
    toStatusOrNull: (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null,
  });
}

test('order workflow only exposes transitions that are currently actionable', () => {
  const service = createService();

  assert.deepEqual(
    service.computeAvailableOrderTransitions({
      status: 'PENDING',
      paymentStatus: 'pending',
    }),
    ['CANCELLED']
  );

  assert.deepEqual(
    service.computeAvailableOrderTransitions({
      status: 'PREPARING',
      paymentStatus: 'completed',
      shipment: {
        trackingNumber: 'TRACK123',
        provider: 'BOXTAL',
      },
    }),
    ['SHIPPED', 'CANCELLED']
  );
});
