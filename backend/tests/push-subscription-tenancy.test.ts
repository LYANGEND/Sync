import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runWithTenant } from '../src/middleware/tenantContext';
import { prisma } from '../src/utils/prisma';
import webpush, { sendPushNotification } from '../src/services/pushService';
import {
  claimPushSubscription,
  PushSubscriptionIdentityError,
  PushSubscriptionStore,
  PushSubscriptionTransactionStore,
  releasePushSubscription,
} from '../src/services/pushSubscriptionService';

interface MemoryBinding {
  id: string;
  endpoint: string;
  tenantId: string;
  userId: string;
  keys: { p256dh: string; auth: string };
}

class MemoryPushSubscriptionStore implements PushSubscriptionStore {
  readonly activeUsers = new Set<string>();
  readonly bindings: MemoryBinding[] = [];
  private nextId = 1;

  activate(tenantId: string, userId: string): void {
    this.activeUsers.add(`${tenantId}:${userId}`);
  }

  async withEndpointLock<T>(
    _endpoint: string,
    operation: (transaction: PushSubscriptionTransactionStore) => Promise<T>,
  ): Promise<T> {
    return operation({
      isActiveTenantUser: async (tenantId, userId) =>
        this.activeUsers.has(`${tenantId}:${userId}`),
      findEndpointBindings: async endpoint => this.bindings
        .filter(binding => binding.endpoint === endpoint)
        .map(({ id, tenantId, userId }) => ({ id, tenantId, userId })),
      deleteEndpointBindingsExcept: async (endpoint, bindingId) => {
        const before = this.bindings.length;
        for (let index = this.bindings.length - 1; index >= 0; index--) {
          const binding = this.bindings[index];
          if (binding.endpoint === endpoint && binding.id !== bindingId) {
            this.bindings.splice(index, 1);
          }
        }
        return before - this.bindings.length;
      },
      updateBinding: async (bindingId, tenantId, userId, keys) => {
        const binding = this.bindings.find(candidate => candidate.id === bindingId);
        if (!binding) throw new Error('Binding not found');
        Object.assign(binding, { tenantId, userId, keys });
        return { id: binding.id, tenantId: binding.tenantId, userId: binding.userId };
      },
      createBinding: async (endpoint, tenantId, userId, keys) => {
        const binding: MemoryBinding = {
          id: `binding-${this.nextId++}`,
          endpoint,
          tenantId,
          userId,
          keys,
        };
        this.bindings.push(binding);
        return { id: binding.id, tenantId, userId };
      },
      deleteOwnedBinding: async (endpoint, tenantId, userId) => {
        const before = this.bindings.length;
        for (let index = this.bindings.length - 1; index >= 0; index--) {
          const binding = this.bindings[index];
          if (
            binding.endpoint === endpoint
            && binding.tenantId === tenantId
            && binding.userId === userId
          ) {
            this.bindings.splice(index, 1);
          }
        }
        return before - this.bindings.length;
      },
    });
  }
}

const endpoint = 'https://push.example.test/browser-endpoint';
const subscription = {
  endpoint,
  expirationTime: null,
  keys: {
    p256dh: 'valid-p256dh-key-material',
    auth: 'valid-auth-key',
  },
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('F-010 / T-022 tenant-safe push ownership', () => {
  it('TV-030 transfers a shared browser endpoint to the latest authenticated tenant', async () => {
    const store = new MemoryPushSubscriptionStore();
    store.activate('tenant-a', 'user-a');
    store.activate('tenant-b', 'user-b');

    const first = await claimPushSubscription('tenant-a', 'user-a', subscription, store);
    const second = await claimPushSubscription('tenant-b', 'user-b', subscription, store);

    expect(first).toMatchObject({ created: true, reassigned: false });
    expect(second).toMatchObject({
      bindingId: first.bindingId,
      created: false,
      reassigned: true,
    });
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0]).toMatchObject({
      id: first.bindingId,
      endpoint,
      tenantId: 'tenant-b',
      userId: 'user-b',
    });
  });

  it('TV-030 prevents stale tenant logout from deleting the current owner', async () => {
    const store = new MemoryPushSubscriptionStore();
    store.activate('tenant-a', 'user-a');
    store.activate('tenant-b', 'user-b');
    await claimPushSubscription('tenant-a', 'user-a', subscription, store);
    await claimPushSubscription('tenant-b', 'user-b', subscription, store);

    await expect(releasePushSubscription('tenant-a', 'user-a', endpoint, store))
      .resolves.toBe(false);
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0].tenantId).toBe('tenant-b');

    await expect(releasePushSubscription('tenant-b', 'user-b', endpoint, store))
      .resolves.toBe(true);
    expect(store.bindings).toHaveLength(0);
  });

  it('TV-030 supports same-tenant user reassignment and rejects inactive identities', async () => {
    const store = new MemoryPushSubscriptionStore();
    store.activate('tenant-a', 'user-a');
    store.activate('tenant-a', 'user-b');
    await claimPushSubscription('tenant-a', 'user-a', subscription, store);

    const result = await claimPushSubscription('tenant-a', 'user-b', subscription, store);

    expect(result.reassigned).toBe(true);
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0]).toMatchObject({ tenantId: 'tenant-a', userId: 'user-b' });
    await expect(claimPushSubscription('tenant-b', 'inactive-user', subscription, store))
      .rejects.toBeInstanceOf(PushSubscriptionIdentityError);
    expect(store.bindings[0]).toMatchObject({ tenantId: 'tenant-a', userId: 'user-b' });
  });

  it('TV-030 removes provider-expired subscriptions by immutable row ID', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode: 410 } as never);
    const deleteMany = jest.spyOn(prisma.pushSubscription, 'deleteMany')
      .mockResolvedValue({ count: 1 });

    const delivered = await runWithTenant('tenant-a', () => sendPushNotification({
      id: 'binding-a',
      endpoint,
      keys: subscription.keys,
    }, { title: 'Test' }));

    expect(delivered).toBe(false);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'binding-a', endpoint },
    });
  });

  it('TV-030 migration replaces global endpoint uniqueness with tenant constraints', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
    const migration = fs.readFileSync(path.resolve(
      __dirname,
      '../prisma/migrations/20260909120000_tenant_safe_push_subscriptions/migration.sql',
    ), 'utf8');

    expect(schema).not.toContain('endpoint  String   @unique');
    expect(schema).toContain('@@unique([tenantId, endpoint])');
    expect(schema).toContain('references: [id, tenantId], onDelete: Cascade');
    expect(migration).toContain('DROP INDEX "push_subscriptions_endpoint_key"');
    expect(migration).toContain('"push_subscriptions_tenantId_endpoint_key"');
    expect(migration).toContain('FOREIGN KEY ("userId", "tenantId")');
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });
});
