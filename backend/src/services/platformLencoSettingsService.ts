import { systemPrisma as prisma } from '../utils/prisma';

// ---------------------------------------------------------------------------
// Platform-wide fallback Lenco payment gateway configuration.
// Used only when a tenant hasn't configured their own Lenco merchant account
// in SchoolSettings, so new/unconfigured tenants can still collect
// mobile-money payments via the platform's own account. Entirely separate
// from a tenant's own Lenco settings.
// ---------------------------------------------------------------------------

/** Idempotently seeds the singleton row the first time platform Lenco settings are used. */
export const ensurePlatformLencoSettings = async () => {
  return prisma.platformLencoSettings.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true },
  });
};

export const getPlatformLencoSettings = async () => {
  return ensurePlatformLencoSettings();
};

export const updatePlatformLencoSettings = async (data: Partial<{
  enabled: boolean;
  apiKey: string | null;
  environment: string | null;
  defaultBearer: string | null;
}>) => {
  await ensurePlatformLencoSettings();
  return prisma.platformLencoSettings.update({ where: { singleton: true }, data });
};
