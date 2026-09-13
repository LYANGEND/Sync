import crypto from 'crypto';
import { z } from 'zod';

export const QUEUE_NAMES = {
  system: 'system',
  communications: 'communications',
  payments: 'payments',
  deadLetter: 'dead-letter',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export const queueNameSchema = z.enum([
  QUEUE_NAMES.system,
  QUEUE_NAMES.communications,
  QUEUE_NAMES.payments,
  QUEUE_NAMES.deadLetter,
]);

export const jobNameSchema = z.string()
  .min(3)
  .max(100)
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, 'Job names must use domain.action format');

export const tenantJobEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().trim().min(1),
  correlationId: z.string().uuid(),
  enqueuedAt: z.string().datetime(),
  actorUserId: z.string().trim().min(1).optional(),
  payload: z.record(z.unknown()),
});

export type TenantJobEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> =
  Omit<z.infer<typeof tenantJobEnvelopeSchema>, 'payload'> & { payload: TPayload };

export interface BuildTenantJobEnvelopeOptions<TPayload extends Record<string, unknown>> {
  tenantId: string;
  payload: TPayload;
  correlationId?: string;
  actorUserId?: string;
  now?: Date;
}

export const buildTenantJobEnvelope = <TPayload extends Record<string, unknown>>(
  options: BuildTenantJobEnvelopeOptions<TPayload>,
): TenantJobEnvelope<TPayload> => tenantJobEnvelopeSchema.parse({
  schemaVersion: 1,
  tenantId: options.tenantId,
  correlationId: options.correlationId || crypto.randomUUID(),
  enqueuedAt: (options.now || new Date()).toISOString(),
  actorUserId: options.actorUserId,
  payload: options.payload,
}) as TenantJobEnvelope<TPayload>;
