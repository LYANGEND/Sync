import assert from 'node:assert/strict';
import test from 'node:test';
import { AcademicTermStatus } from '@prisma/client';
import {
  activeFlagForLifecycleStatus,
  canTransitionTerm,
  canWriteToTerm,
  lifecycleStatusForActiveFlag,
  TermWriteCategory,
} from '../src/utils/termLifecycleRules';

test('term lifecycle permits only forward close transitions and reopening from closing', () => {
  assert.equal(canTransitionTerm(AcademicTermStatus.DRAFT, AcademicTermStatus.ACTIVE), true);
  assert.equal(canTransitionTerm(AcademicTermStatus.ACTIVE, AcademicTermStatus.CLOSING), true);
  assert.equal(canTransitionTerm(AcademicTermStatus.CLOSING, AcademicTermStatus.ACTIVE), true);
  assert.equal(canTransitionTerm(AcademicTermStatus.CLOSING, AcademicTermStatus.CLOSED), true);

  assert.equal(canTransitionTerm(AcademicTermStatus.ACTIVE, AcademicTermStatus.DRAFT), false);
  assert.equal(canTransitionTerm(AcademicTermStatus.CLOSED, AcademicTermStatus.ACTIVE), false);
});

test('legacy active flag maps consistently to lifecycle status', () => {
  assert.equal(lifecycleStatusForActiveFlag(true), AcademicTermStatus.ACTIVE);
  assert.equal(lifecycleStatusForActiveFlag(false), AcademicTermStatus.DRAFT);

  for (const status of Object.values(AcademicTermStatus)) {
    assert.equal(
      activeFlagForLifecycleStatus(status),
      status === AcademicTermStatus.ACTIVE,
    );
  }
});

test('closed terms accept receipts and auditable financial adjustments but require an approved historical amendment', () => {
  assert.equal(
    canWriteToTerm(AcademicTermStatus.CLOSED, 'FINANCIAL_ADJUSTMENT'),
    true,
  );
  assert.equal(
    canWriteToTerm(AcademicTermStatus.CLOSED, 'FINANCIAL_RECEIPT'),
    true,
  );
  assert.equal(
    canWriteToTerm(AcademicTermStatus.CLOSED, 'ACADEMIC_ACTIVITY'),
    false,
  );
  assert.equal(
    canWriteToTerm(AcademicTermStatus.CLOSED, 'HISTORICAL_AMENDMENT'),
    false,
  );
  assert.equal(
    canWriteToTerm(AcademicTermStatus.CLOSED, 'HISTORICAL_AMENDMENT', true),
    true,
  );
});

test('draft and closing write permissions match rollover policy', () => {
  assert.equal(canWriteToTerm(AcademicTermStatus.DRAFT, 'SETUP'), true);
  assert.equal(canWriteToTerm(AcademicTermStatus.DRAFT, 'ACADEMIC_ACTIVITY'), false);
  assert.equal(canWriteToTerm(AcademicTermStatus.DRAFT, 'FINANCIAL_OBLIGATION'), false);
  assert.equal(canWriteToTerm(AcademicTermStatus.ACTIVE, 'SETUP'), true);
  assert.equal(canWriteToTerm(AcademicTermStatus.ACTIVE, 'FINANCIAL_OBLIGATION'), true);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSING, 'FINALIZATION'), true);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSING, 'FINANCIAL_ADJUSTMENT'), true);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSING, 'SETUP'), false);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSING, 'ACADEMIC_ACTIVITY'), false);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSING, 'FINANCIAL_OBLIGATION'), false);
  assert.equal(canWriteToTerm(AcademicTermStatus.CLOSED, 'FINANCIAL_ADJUSTMENT'), true);
});

test('write permissions match the complete lifecycle status matrix', () => {
  const categories: TermWriteCategory[] = [
    'SETUP',
    'ACADEMIC_ACTIVITY',
    'FINALIZATION',
    'FINANCIAL_OBLIGATION',
    'FINANCIAL_RECEIPT',
    'FINANCIAL_ADJUSTMENT',
    'HISTORICAL_AMENDMENT',
  ];
  const expected: Record<AcademicTermStatus, ReadonlySet<TermWriteCategory>> = {
    DRAFT: new Set(['SETUP']),
    ACTIVE: new Set([
      'SETUP',
      'ACADEMIC_ACTIVITY',
      'FINALIZATION',
      'FINANCIAL_OBLIGATION',
      'FINANCIAL_RECEIPT',
      'FINANCIAL_ADJUSTMENT',
    ]),
    CLOSING: new Set(['FINALIZATION', 'FINANCIAL_RECEIPT', 'FINANCIAL_ADJUSTMENT']),
    CLOSED: new Set(['FINANCIAL_RECEIPT', 'FINANCIAL_ADJUSTMENT']),
  };

  for (const status of Object.values(AcademicTermStatus)) {
    for (const category of categories) {
      assert.equal(
        canWriteToTerm(status, category),
        expected[status].has(category),
        `${category} permission mismatch for ${status}`,
      );
    }
  }
});
