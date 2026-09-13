import { systemPrisma as prisma } from '../utils/prisma';

// ---------------------------------------------------------------------------
// Platform-wide fallback SMS provider configuration.
// Used only when a tenant hasn't configured their own SMS provider in
// SchoolSettings, so new/unconfigured tenants can still send SMS via the
// platform's own account. Entirely separate from a tenant's own SMS settings.
// ---------------------------------------------------------------------------

/** Idempotently seeds the singleton row the first time platform SMS settings are used. */
export const ensurePlatformSmsSettings = async () => {
  return prisma.platformSmsSettings.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true },
  });
};

export const getPlatformSmsSettings = async () => {
  return ensurePlatformSmsSettings();
};

export const updatePlatformSmsSettings = async (data: Partial<{
  enabled: boolean;
  provider: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  senderId: string | null;
}>) => {
  await ensurePlatformSmsSettings();
  return prisma.platformSmsSettings.update({ where: { singleton: true }, data });
};
