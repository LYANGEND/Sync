import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenantId(): string | undefined {
  return tenantStore.getStore()?.tenantId;
}

export function runWithTenant<T>(tenantId: string, operation: () => T): Promise<Awaited<T>> {
  if (!tenantId?.trim()) {
    throw new Error('A valid tenant ID is required');
  }
  return tenantStore.run({ tenantId }, async () => await operation()) as Promise<Awaited<T>>;
}
