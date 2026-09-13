import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runWithTenant } from '../src/middleware/tenantContext';
import { prisma } from '../src/utils/prisma';
import {
  classIdentityKey,
  ensureClassExistsForTerm,
  normalizeClassName,
} from '../src/services/classResolutionService';
import { bulkCreateStudents, getMyChildren } from '../src/controllers/studentController';
import { getConversations } from '../src/controllers/communicationController';
import { getReconciliationDashboard } from '../src/controllers/paymentController';
import tenantRouter from '../src/routes/tenantRoutes';

const createResponse = (): Response => {
  const response: any = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.send = jest.fn(() => response);
  return response as Response;
};

const responseJson = (response: Response): any =>
  (response.json as unknown as jest.Mock).mock.calls[0][0];

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('F-001 / T-001 / T-002 class import identity', () => {
  it('TV-001 resolves concurrent class creation attempts to one class ID', async () => {
    let storedId: string | undefined;
    const findClass = jest.spyOn(prisma.class, 'findFirst') as any;
    findClass.mockImplementation(async () => storedId ? { id: storedId } : null);

    const createClass = jest.spyOn(prisma.class, 'create') as any;
    createClass.mockImplementation(async () => {
      await new Promise<void>(resolve => setImmediate(resolve));
      if (storedId) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      storedId = 'class-1';
      return { id: storedId };
    });

    const result = await runWithTenant('tenant-a', () => Promise.all([
      ensureClassExistsForTerm(' Grade One ', 'term-1', 'teacher-1', 'branch-1'),
      ensureClassExistsForTerm('grade one', 'term-1', 'teacher-1', 'branch-1'),
    ]));

    expect(result).toEqual(['class-1', 'class-1']);
    expect(new Set(result).size).toBe(1);
    expect(createClass).toHaveBeenCalledTimes(2);
  });

  it('TV-002 migration guards conflicts and creates branch-aware normalized indexes', () => {
    const migration = fs.readFileSync(path.resolve(
      __dirname,
      '../prisma/migrations/20260909103000_add_class_uniqueness_per_tenant_term/migration.sql',
    ), 'utf8');

    expect(migration).toContain('HAVING COUNT(*) > 1');
    expect(migration).toContain('preflight:class-uniqueness');
    expect(migration).toContain('LOWER(BTRIM("name"))');
    expect(migration).toContain('WHERE "branchId" IS NULL');
    expect(migration).toContain('WHERE "branchId" IS NOT NULL');
  });

  it('TV-003 reuses an existing class on an idempotent retry', async () => {
    const findClass = jest.spyOn(prisma.class, 'findFirst') as any;
    findClass
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'class-1' });
    const createClass = jest.spyOn(prisma.class, 'create') as any;
    createClass.mockResolvedValue({ id: 'class-1' });

    const result = await runWithTenant('tenant-a', async () => [
      await ensureClassExistsForTerm('Grade One', 'term-1', 'teacher-1', 'branch-1'),
      await ensureClassExistsForTerm('grade one', 'term-1', 'teacher-1', 'branch-1'),
    ]);

    expect(result).toEqual(['class-1', 'class-1']);
    expect(createClass).toHaveBeenCalledTimes(1);
  });

  it('TV-004 maps repeated normalized names deterministically within each branch', async () => {
    expect(normalizeClassName('  Grade   One  ')).toBe('Grade One');
    expect(classIdentityKey(' Grade   One ', 'branch-1'))
      .toBe(classIdentityKey('grade one', 'branch-1'));
    expect(classIdentityKey('Grade One', 'branch-1'))
      .not.toBe(classIdentityKey('Grade One', 'branch-2'));

    jest.spyOn(prisma.academicTerm, 'findFirst').mockResolvedValue({
      id: 'term-1',
      name: 'Term 1',
    } as any);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'teacher-1' } as any);
    jest.spyOn(prisma.class, 'findMany').mockResolvedValue([]);
    jest.spyOn(prisma.class, 'findFirst').mockResolvedValue(null);
    const createClass = jest.spyOn(prisma.class, 'create').mockResolvedValue({ id: 'class-1' } as any);
    jest.spyOn(prisma.student, 'findFirst').mockResolvedValue(null);
    const createStudents = jest.spyOn(prisma.student, 'createMany').mockResolvedValue({ count: 2 });
    jest.spyOn(prisma.student, 'findMany').mockResolvedValue([]);

    const branchId = '00000000-0000-4000-8000-000000000001';
    const request = {
      user: { userId: 'user-1', role: 'SECRETARY', branchId },
      body: [
        {
          firstName: 'Ada',
          lastName: 'Lovelace',
          dateOfBirth: '2015-01-01',
          gender: 'FEMALE',
          className: ' Grade   One ',
          admissionNumber: '2026-0001',
        },
        {
          firstName: 'Alan',
          lastName: 'Turing',
          dateOfBirth: '2015-02-01',
          gender: 'MALE',
          className: 'grade one',
          admissionNumber: '2026-0002',
        },
      ],
    } as unknown as Request;
    const response = createResponse();

    await runWithTenant('tenant-a', () => bulkCreateStudents(request, response));

    expect(createClass).toHaveBeenCalledTimes(1);
    const createManyData = (createStudents.mock.calls[0][0] as any).data;
    expect(createManyData).toHaveLength(2);
    expect(createManyData.map((student: any) => student.classId)).toEqual(['class-1', 'class-1']);
    expect(createManyData.map((student: any) => student.branchId)).toEqual([branchId, branchId]);
    expect(response.status).toHaveBeenCalledWith(201);
  });
});

describe('F-011 / T-003 / T-004 tenant custom-field authorization', () => {
  const findAuthorizationGuard = (routePath: string, method: 'post' | 'delete') => {
    const layer = (tenantRouter as any).stack.find((candidate: any) =>
      candidate.route?.path === routePath && candidate.route.methods[method],
    );
    if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
    return layer.route.stack[1].handle;
  };

  for (const route of [
    { path: '/custom-fields', method: 'post' as const },
    { path: '/custom-fields/:id', method: 'delete' as const },
  ]) {
    it(`TV-005/TV-006 allows intended roles and rejects teachers on ${route.method.toUpperCase()} ${route.path}`, () => {
      const guard = findAuthorizationGuard(route.path, route.method);

      for (const role of ['SUPER_ADMIN', 'BRANCH_MANAGER']) {
        const next = jest.fn();
        guard({ user: { role } } as any, createResponse(), next);
        expect(next).toHaveBeenCalledTimes(1);
      }

      const deniedResponse = createResponse();
      const deniedNext = jest.fn();
      guard({ user: { role: 'TEACHER' } } as any, deniedResponse, deniedNext);
      expect(deniedResponse.status).toHaveBeenCalledWith(403);
      expect(deniedNext).not.toHaveBeenCalled();
    });
  }
});

describe('F-002 / T-005 conversation query batching', () => {
  it('TV-007/TV-008 keeps unread-query count constant for 1,000 conversations', async () => {
    const conversations = Array.from({ length: 1_000 }, (_, index) => ({
      id: `conversation-${index}`,
      isGroup: false,
      name: null,
      participants: [
        { userId: 'user-1', user: { id: 'user-1', fullName: 'Current User', role: 'PARENT', email: 'me@example.com' } },
        { userId: `user-${index + 2}`, user: { id: `user-${index + 2}`, fullName: `User ${index}`, role: 'TEACHER', email: `user${index}@example.com` } },
      ],
      messages: [],
      updatedAt: new Date('2026-09-09T10:00:00Z'),
    }));

    jest.spyOn(prisma.conversation, 'findMany').mockResolvedValue(conversations as any);
    const groupedUnread = jest.spyOn(prisma.message, 'groupBy').mockResolvedValue([
      { conversationId: 'conversation-0', _count: { _all: 4 } },
    ] as any);
    const perConversationCount = jest.spyOn(prisma.message, 'count');
    const response = createResponse();

    await runWithTenant('tenant-a', () => getConversations({
      user: { userId: 'user-1' },
    } as unknown as Request, response));

    expect(groupedUnread).toHaveBeenCalledTimes(1);
    expect(perConversationCount).not.toHaveBeenCalled();
    const payload = responseJson(response);
    expect(payload).toHaveLength(1_000);
    expect(payload[0].unreadCount).toBe(4);
    expect(payload[1].unreadCount).toBe(0);
  });

  it('TV-009 defines the composite unread lookup index', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('@@index([tenantId, conversationId, isRead, senderId])');
  });
});

describe('F-003 / T-007 parent dashboard batching', () => {
  it('TV-010/TV-011 uses one assessment result query and preserves pending results', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T10:00:00Z'));
    jest.spyOn(prisma.academicTerm, 'findFirst').mockResolvedValue({ id: 'term-1' } as any);

    const studentBase = {
      classId: 'class-1',
      class: { id: 'class-1', name: 'Grade One' },
      attendance: [],
      payments: [],
      feeStructures: [],
      assessmentResults: [],
      termResults: [],
      termReports: [],
    };
    jest.spyOn(prisma.student, 'findMany').mockResolvedValue([
      { ...studentBase, id: 'student-1' },
      { ...studentBase, id: 'student-2' },
    ] as any);

    const assessments = [
      { id: 'assessment-1', classId: 'class-1', subject: { id: 'subject-1' }, date: new Date('2026-09-08') },
      { id: 'assessment-2', classId: 'class-1', subject: { id: 'subject-2' }, date: new Date('2026-09-09') },
    ];
    const assessmentQuery = jest.spyOn(prisma.assessment, 'findMany').mockResolvedValue(assessments as any);
    const resultQuery = jest.spyOn(prisma.assessmentResult, 'findMany').mockResolvedValue([
      { assessmentId: 'assessment-1', studentId: 'student-1' },
    ] as any);
    const perAssessmentLookup = jest.spyOn(prisma.assessmentResult, 'findUnique');
    const timetableQuery = jest.spyOn(prisma.timetablePeriodClass, 'findMany').mockResolvedValue([]);
    const response = createResponse();

    await runWithTenant('tenant-a', () => getMyChildren({
      user: { userId: 'parent-1' },
    } as unknown as Request, response));

    expect(assessmentQuery).toHaveBeenCalledTimes(1);
    expect(resultQuery).toHaveBeenCalledTimes(1);
    expect(timetableQuery).toHaveBeenCalledTimes(1);
    expect(perAssessmentLookup).not.toHaveBeenCalled();

    const payload = responseJson(response);
    expect(payload[0].pendingAssessments.map((item: any) => item.id)).toEqual(['assessment-2']);
    expect(payload[1].pendingAssessments.map((item: any) => item.id)).toEqual([
      'assessment-1',
      'assessment-2',
    ]);
  });
});

describe('F-004 / T-008 reconciliation pagination', () => {
  it('TV-012/TV-013 bounds pagination and calculates summary outside the status filter', async () => {
    const payment = {
      id: 'payment-1',
      amount: 100,
      allocations: [
        {
          amount: 75,
          studentFee: {
            dueDate: new Date('2026-09-30'),
            feeTemplate: { name: 'Tuition' },
          },
        },
      ],
      bankReference: null,
      mobileMoneyCollection: { reference: 'collection-1', operatorTransactionId: null, status: 'SUCCESSFUL' },
    };

    const pageQuery = jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([payment] as any);
    const countQuery = jest.spyOn(prisma.payment, 'count') as any;
    countQuery
      .mockResolvedValueOnce(40_000)
      .mockResolvedValueOnce(17);
    const aggregateQuery = jest.spyOn(prisma.payment, 'aggregate') as any;
    aggregateQuery
      .mockResolvedValueOnce({ _count: { id: 100_000 }, _sum: { amount: 2_000_000 } })
      .mockResolvedValueOnce({ _count: { id: 60_000 }, _sum: { amount: 1_400_000 } })
      .mockResolvedValueOnce({ _count: { id: 40_000 }, _sum: { amount: 600_000 } });

    const response = createResponse();
    await runWithTenant('tenant-a', () => getReconciliationDashboard({
      query: {
        page: '2.9',
        limit: '500',
        status: 'unreconciled',
        method: 'ALL',
      },
      user: { role: 'SUPER_ADMIN' },
    } as unknown as Request, response));

    expect(pageQuery).toHaveBeenCalledWith(expect.objectContaining({
      skip: 200,
      take: 200,
      where: expect.objectContaining({ isReconciled: false }),
    }));
    expect((aggregateQuery.mock.calls[0][0] as any).where).not.toHaveProperty('isReconciled');

    const payload = responseJson(response);
    expect(payload.meta).toEqual({ total: 40_000, page: 2, limit: 200, totalPages: 200 });
    expect(payload.summary).toEqual(expect.objectContaining({
      totalPayments: 100_000,
      reconciledPayments: 60_000,
      unreconciledPayments: 40_000,
      missingBankReference: 17,
    }));
    expect(payload.payments[0]).toEqual(expect.objectContaining({
      allocatedAmount: 75,
      unallocatedAmount: 25,
      settlementReference: 'collection-1',
    }));
  });
});
