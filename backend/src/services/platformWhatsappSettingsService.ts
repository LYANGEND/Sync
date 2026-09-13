import { systemPrisma as prisma } from '../utils/prisma';

// ---------------------------------------------------------------------------
// Platform-wide fallback WhatsApp provider configuration.
// Used only when a tenant hasn't configured their own WhatsApp provider in
// SchoolSettings, so new/unconfigured tenants can still send WhatsApp
// messages via the platform's own account. Entirely separate from a
// tenant's own WhatsApp settings.
// ---------------------------------------------------------------------------

/** Idempotently seeds the singleton row the first time platform WhatsApp settings are used. */
export const ensurePlatformWhatsappSettings = async () => {
  return prisma.platformWhatsappSettings.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true },
  });
};

export const getPlatformWhatsappSettings = async () => {
  return ensurePlatformWhatsappSettings();
};

export const updatePlatformWhatsappSettings = async (data: Partial<{
  enabled: boolean;
  provider: string | null;
  apiKey: string | null;
  phoneId: string | null;
}>) => {
  await ensurePlatformWhatsappSettings();
  return prisma.platformWhatsappSettings.update({ where: { singleton: true }, data });
};
