import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenantId(): string | undefined {
  return tenantStore.getStore()?.tenantId;
}
