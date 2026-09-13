export function applyTenantToCreateData(data: any, tenantId: string): any {
  if (Array.isArray(data)) return data.map((item) => applyTenantToCreateData(item, tenantId));
  if (!data || typeof data !== 'object' || data instanceof Date) return data;

  const result: any = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (key === 'create') {
      result[key] = applyTenantToCreateData(value, tenantId);
    } else if (key === 'createMany' && value && typeof value === 'object' && 'data' in value) {
      result[key] = { ...value, data: applyTenantToCreateData((value as any).data, tenantId) };
    } else if (key === 'upsert' && value && typeof value === 'object') {
      result[key] = {
        ...value,
        create: applyTenantToCreateData((value as any).create, tenantId),
        update: applyTenantToNestedWrites((value as any).update, tenantId),
      };
    } else {
      result[key] = applyTenantToNestedWrites(value, tenantId);
    }
  }

  return { ...result, tenantId };
}

export function applyTenantToNestedWrites(data: any, tenantId: string): any {
  if (Array.isArray(data)) return data.map((item) => applyTenantToNestedWrites(item, tenantId));
  if (!data || typeof data !== 'object' || data instanceof Date) return data;

  const result: any = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (key === 'create') {
      result[key] = applyTenantToCreateData(value, tenantId);
    } else if (key === 'createMany' && value && typeof value === 'object' && 'data' in value) {
      result[key] = { ...value, data: applyTenantToCreateData((value as any).data, tenantId) };
    } else if (key === 'upsert' && value && typeof value === 'object') {
      result[key] = {
        ...value,
        create: applyTenantToCreateData((value as any).create, tenantId),
        update: applyTenantToNestedWrites((value as any).update, tenantId),
      };
    } else {
      result[key] = applyTenantToNestedWrites(value, tenantId);
    }
  }
  return result;
}
