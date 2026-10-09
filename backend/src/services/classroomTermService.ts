import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { TermWriteCategory } from '../utils/termLifecycleRules';
import { TermLifecycleError, runTermWriteTransaction } from './termLifecycleService';

type ClassroomClient = Prisma.TransactionClient | typeof prisma;

export interface ClassroomTermContext {
  classroomId: string;
  classId: string;
  academicTermId: string;
}

const resolveClassroomTermContext = async (
  classroomId: string,
  client: ClassroomClient,
): Promise<ClassroomTermContext> => {
  const classroom = await client.virtualClassroom.findUnique({
    where: { id: classroomId },
    select: { id: true, classId: true },
  });
  if (!classroom) {
    throw new TermLifecycleError(
      'TERM_LIFECYCLE_CONFLICT',
      'Virtual classroom no longer exists',
      404,
    );
  }
  if (!classroom.classId) {
    throw new TermLifecycleError(
      'TERM_LIFECYCLE_CONFLICT',
      'Virtual classroom must be linked to a term-owned class before it can be changed',
      400,
    );
  }

  const targetClass = await client.class.findUnique({
    where: { id: classroom.classId },
    select: { academicTermId: true },
  });
  if (!targetClass) {
    throw new TermLifecycleError(
      'TERM_LIFECYCLE_CONFLICT',
      'Virtual classroom is linked to a class that no longer exists',
    );
  }

  return {
    classroomId: classroom.id,
    classId: classroom.classId,
    academicTermId: targetClass.academicTermId,
  };
};

export const getClassroomTermContext = async (
  classroomId: string,
): Promise<ClassroomTermContext> => resolveClassroomTermContext(classroomId, prisma);

export const runClassroomTermWriteTransaction = async <T>(
  classroomId: string,
  category: TermWriteCategory,
  operation: (tx: Prisma.TransactionClient, context: ClassroomTermContext) => Promise<T>,
): Promise<T> => {
  const initialContext = await resolveClassroomTermContext(classroomId, prisma);

  return runTermWriteTransaction(initialContext.academicTermId, category, async tx => {
    const currentContext = await resolveClassroomTermContext(classroomId, tx);
    if (currentContext.classId !== initialContext.classId
      || currentContext.academicTermId !== initialContext.academicTermId) {
      throw new TermLifecycleError(
        'TERM_LIFECYCLE_CONFLICT',
        'Virtual classroom term ownership changed while it was being updated',
      );
    }

    return operation(tx, currentContext);
  });
};
