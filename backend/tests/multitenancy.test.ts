import crypto from 'crypto';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { getCurrentTenantId, runWithTenant } from '../src/middleware/tenantContext';
import { requirePublicTenant } from '../src/middleware/publicTenantContext';
import { getPublicSettings } from '../src/controllers/settingsController';
import { applyTenantToCreateData, applyTenantToNestedWrites } from '../src/utils/tenantWritePolicy';
import { verifyWebhookSignature } from '../src/services/lencoService';
import {
  AI_TENANT_BOUNDARY_INSTRUCTION,
  applyAITenantBoundary,
  assertAITenantId,
  validateAITenantReferences,
} from '../src/services/aiTenantBoundary';
import { prisma, systemPrisma } from '../src/utils/prisma';
import {
  AIConversationAccessError,
  getMessageHistory,
} from '../src/services/conversationService';

describe('tenant context', () => {
  it('isolates concurrent asynchronous operations', async () => {
    const [first, second] = await Promise.all([
      runWithTenant('tenant-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCurrentTenantId();
      }),
      runWithTenant('tenant-b', async () => getCurrentTenantId()),
    ]);

    expect(first).toBe('tenant-a');
    expect(second).toBe('tenant-b');
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('rejects an empty tenant identity', () => {
    expect(() => runWithTenant('', () => undefined)).toThrow('valid tenant ID');
  });

  it('supports the legacy seeded tenant ID without granting platform access', async () => {
    await expect(runWithTenant('SYSTEM', () => getCurrentTenantId())).resolves.toBe('SYSTEM');
  });
});

describe('nested tenant writes', () => {
  it('injects tenant IDs into top-level and nested create records', () => {
    const result = applyTenantToCreateData({
      name: 'Budget',
      items: {
        create: [{ description: 'Books' }, { description: 'Transport', tenantId: 'attacker' }],
      },
    }, 'tenant-a');

    expect(result.tenantId).toBe('tenant-a');
    expect(result.items.create).toEqual([
      { description: 'Books', tenantId: 'tenant-a' },
      { description: 'Transport', tenantId: 'tenant-a' },
    ]);
  });

  it('injects nested update creates without modifying connect selectors', () => {
    const result = applyTenantToNestedWrites({
      subjects: { connect: [{ id: 'subject-1' }] },
      items: { createMany: { data: [{ description: 'Item' }] } },
    }, 'tenant-a');

    expect(result.subjects.connect).toEqual([{ id: 'subject-1' }]);
    expect(result.items.createMany.data[0].tenantId).toBe('tenant-a');
  });
});

describe('public tenant fallbacks', () => {
  it('allows public requests without a matching tenant to continue without a 500', async () => {
    const next = jest.fn();
    const req = { headers: { host: 'localhost:4000' } } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    jest.spyOn(systemPrisma.tenant, 'findFirst').mockResolvedValue(null);

    await requirePublicTenant(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns default branding when the tenant context is unavailable', async () => {
    const req = {} as any;
    const res = { json: jest.fn() } as any;

    await getPublicSettings(req, res);

    expect(res.json).toHaveBeenCalledWith({
      schoolName: 'My School',
      primaryColor: '#2563eb',
      secondaryColor: '#475569',
      accentColor: '#f59e0b',
    });
  });
});

describe('AI tenant boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuses to build AI context without an authenticated tenant', () => {
    expect(() => applyAITenantBoundary([{ role: 'user', content: 'Hello' }]))
      .toThrow('authenticated tenant context');
  });

  it('places the immutable tenant boundary before application prompts', async () => {
    const messages = await runWithTenant('tenant-a', () => applyAITenantBoundary([
      { role: 'system' as const, content: 'Application instructions' },
      { role: 'user' as const, content: 'Show school data' },
    ]));

    expect(messages[0]).toEqual({ role: 'system', content: AI_TENANT_BOUNDARY_INSTRUCTION });
    expect(messages[1].content).toBe('Application instructions');
    expect(messages[2].content).toBe('Show school data');
  });

  it('detects changed async tenant context and rejects tenant selectors', async () => {
    await runWithTenant('tenant-a', async () => {
      expect(() => assertAITenantId('tenant-b')).toThrow('boundary mismatch');
      await expect(validateAITenantReferences({ tenantId: 'tenant-b' }))
        .rejects.toThrow('cannot select or change tenant scope');
    });
  });

  it('denies message history when the conversation is not owned by the user', async () => {
    jest.spyOn(prisma.aIConversation, 'findFirst').mockResolvedValue(null);
    const messageQuery = jest.spyOn(prisma.aIMessage, 'findMany');

    await expect(runWithTenant('tenant-a', () =>
      getMessageHistory('conversation-from-another-user', 'current-user'),
    )).rejects.toBeInstanceOf(AIConversationAccessError);
    expect(messageQuery).not.toHaveBeenCalled();
  });
});

describe('Lenco webhook signatures', () => {
  const originalSecret = process.env.LENCO_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.LENCO_WEBHOOK_SECRET;
    else process.env.LENCO_WEBHOOK_SECRET = originalSecret;
  });

  it('accepts only a matching HMAC SHA-256 signature', () => {
    process.env.LENCO_WEBHOOK_SECRET = 'test-secret';
    const payload = JSON.stringify({ data: { reference: 'ref-1' } });
    const signature = crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, `sha256=${signature}`)).toBe(true);
    expect(verifyWebhookSignature(`${payload}x`, `sha256=${signature}`)).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    delete process.env.LENCO_WEBHOOK_SECRET;
    expect(verifyWebhookSignature('{}', 'abc')).toBe(false);
  });
});
