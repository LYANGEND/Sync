import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { systemPrisma } from '../utils/prisma';

const httpsEndpointSchema = z.string()
  .trim()
  .min(1)
  .max(4_096)
  .url()
  .refine(value => new URL(value).protocol === 'https:', {
    message: 'Push endpoint must use HTTPS',
  });

const pushKeysSchema = z.object({
  p256dh: z.string().min(16).max(1_024),
  auth: z.string().min(8).max(512),
}).strict();

export const pushSubscriptionInputSchema = z.object({
  endpoint: httpsEndpointSchema,
  expirationTime: z.number().int().nullable().optional(),
  keys: pushKeysSchema,
}).strict();

export const pushUnsubscribeInputSchema = z.object({
  endpoint: httpsEndpointSchema,
}).strict();

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

interface PushSubscriptionBinding {
  id: string;
  tenantId: string;
  userId: string;
}

export interface PushSubscriptionTransactionStore {
  isActiveTenantUser(tenantId: string, userId: string): Promise<boolean>;
  findEndpointBindings(endpoint: string): Promise<PushSubscriptionBinding[]>;
  deleteEndpointBindingsExcept(endpoint: string, bindingId: string): Promise<number>;
  updateBinding(
    bindingId: string,
    tenantId: string,
    userId: string,
    keys: PushSubscriptionInput['keys'],
  ): Promise<PushSubscriptionBinding>;
  createBinding(
    endpoint: string,
    tenantId: string,
    userId: string,
    keys: PushSubscriptionInput['keys'],
  ): Promise<PushSubscriptionBinding>;
  deleteOwnedBinding(endpoint: string, tenantId: string, userId: string): Promise<number>;
}

export interface PushSubscriptionStore {
  withEndpointLock<T>(
    endpoint: string,
    operation: (transaction: PushSubscriptionTransactionStore) => Promise<T>,
  ): Promise<T>;
}

export interface PushSubscriptionClaimResult {
  bindingId: string;
  created: boolean;
  reassigned: boolean;
  duplicateBindingsRemoved: number;
}

export class PushSubscriptionIdentityError extends Error {
  constructor() {
    super('Authenticated user is not active in the requested tenant');
    this.name = 'PushSubscriptionIdentityError';
  }
}

class PrismaPushSubscriptionStore implements PushSubscriptionStore {
  async withEndpointLock<T>(
    endpoint: string,
    operation: (transaction: PushSubscriptionTransactionStore) => Promise<T>,
  ): Promise<T> {
    return systemPrisma.$transaction(async database => {
      // Cross-tenant ownership transfer is intentionally isolated here. The
      // advisory lock serializes claims for the same opaque browser endpoint
      // across API replicas after the global endpoint constraint is removed.
      await database.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${endpoint}, 0))
      `;

      const transaction: PushSubscriptionTransactionStore = {
        isActiveTenantUser: async (tenantId, userId) => Boolean(await database.user.findFirst({
          where: { id: userId, tenantId, isActive: true },
          select: { id: true },
        })),
        findEndpointBindings: endpointValue => database.pushSubscription.findMany({
          where: { endpoint: endpointValue },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, tenantId: true, userId: true },
        }),
        deleteEndpointBindingsExcept: async (endpointValue, bindingId) => (
          await database.pushSubscription.deleteMany({
            where: { endpoint: endpointValue, id: { not: bindingId } },
          })
        ).count,
        updateBinding: (bindingId, tenantId, userId, keys) => database.pushSubscription.update({
          where: { id: bindingId },
          data: {
            tenantId,
            userId,
            keys: keys as Prisma.InputJsonValue,
          },
          select: { id: true, tenantId: true, userId: true },
        }),
        createBinding: (endpointValue, tenantId, userId, keys) => database.pushSubscription.create({
          data: {
            endpoint: endpointValue,
            tenantId,
            userId,
            keys: keys as Prisma.InputJsonValue,
          },
          select: { id: true, tenantId: true, userId: true },
        }),
        deleteOwnedBinding: async (endpointValue, tenantId, userId) => (
          await database.pushSubscription.deleteMany({
            where: { endpoint: endpointValue, tenantId, userId },
          })
        ).count,
      };

      return operation(transaction);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 5_000,
    });
  }
}

const defaultStore = new PrismaPushSubscriptionStore();

const requireIdentity = (tenantId: string, userId: string): void => {
  if (!tenantId?.trim() || !userId?.trim()) {
    throw new PushSubscriptionIdentityError();
  }
};

/**
 * Claims one browser endpoint for exactly one current tenant/user identity.
 * The latest authenticated claim wins. Any stale cross-tenant bindings are
 * removed while the endpoint lock is held.
 */
export const claimPushSubscription = async (
  tenantId: string,
  userId: string,
  input: PushSubscriptionInput,
  store: PushSubscriptionStore = defaultStore,
): Promise<PushSubscriptionClaimResult> => {
  requireIdentity(tenantId, userId);
  const subscription = pushSubscriptionInputSchema.parse(input);

  return store.withEndpointLock(subscription.endpoint, async transaction => {
    if (!await transaction.isActiveTenantUser(tenantId, userId)) {
      throw new PushSubscriptionIdentityError();
    }

    const bindings = await transaction.findEndpointBindings(subscription.endpoint);
    const survivor = bindings[0];
    if (!survivor) {
      const created = await transaction.createBinding(
        subscription.endpoint,
        tenantId,
        userId,
        subscription.keys,
      );
      return {
        bindingId: created.id,
        created: true,
        reassigned: false,
        duplicateBindingsRemoved: 0,
      };
    }

    const duplicateBindingsRemoved = await transaction.deleteEndpointBindingsExcept(
      subscription.endpoint,
      survivor.id,
    );
    const reassigned = survivor.tenantId !== tenantId || survivor.userId !== userId;
    const updated = await transaction.updateBinding(
      survivor.id,
      tenantId,
      userId,
      subscription.keys,
    );

    return {
      bindingId: updated.id,
      created: false,
      reassigned,
      duplicateBindingsRemoved,
    };
  });
};

/**
 * Releases a subscription only when the requesting tenant and user still own
 * it. A stale logout therefore cannot delete an endpoint claimed by a newer
 * session in another tenant.
 */
export const releasePushSubscription = async (
  tenantId: string,
  userId: string,
  endpoint: string,
  store: PushSubscriptionStore = defaultStore,
): Promise<boolean> => {
  requireIdentity(tenantId, userId);
  const parsedEndpoint = httpsEndpointSchema.parse(endpoint);
  return store.withEndpointLock(parsedEndpoint, async transaction => (
    await transaction.deleteOwnedBinding(parsedEndpoint, tenantId, userId)
  ) > 0);
};
