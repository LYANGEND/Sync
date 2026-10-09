import { prisma } from '../utils/prisma';
import aiService from './aiService';
import { TermLifecycleError, runTermWriteTransaction } from './termLifecycleService';

/**
 * TEACHER INTELLIGENCE ENGINE
 * 
 * Safety Rules:
 * 1. Prisma/SQL does ALL math. AI never calculates scores.
 * 2. AI only diagnoses (why) and drafts (what to do). 
 * 3. Teacher always approves before anything reaches a student or parent.
 * 4. Minimum data thresholds: AI is only invoked when >= 3 students make the same error.
 */
export class TeachingHubService {

  /**
   * STEP 1: Post-Assessment Mastery Processor
   * Called after a quiz is graded.
   * Deterministic math only — no AI involved here.
   */
  static async processAssessmentMastery(assessmentId: string) {
    try {
      console.log(`[TeachingHub] Processing mastery for assessment: ${assessmentId}`);

      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          class: true,
          subject: true,
          submissions: {
            include: {
              student: true,
              responses: {
                include: { question: { include: { options: true } } }
              }
            }
          }
        }
      });

      if (!assessment || !assessment.submissions.length) {
        console.log('[TeachingHub] No submissions found for assessment.');
        return;
      }

      // Resolve the SubTopic for this assessment via Subject → Topic → SubTopic chain
      const topics = await prisma.topic.findMany({
        where: { subjectId: assessment.subjectId },
        include: { subtopics: true }
      });

      const allSubTopics = topics.flatMap(t => t.subtopics);
      if (allSubTopics.length === 0) {
        console.log('[TeachingHub] No subtopics found for this subject. Skipping mastery calculation.');
        return;
      }

      // Use the first subtopic as the assessment's learning objective
      // In production, assessments should be directly tagged to a subtopic
      const targetSubTopicId = allSubTopics[0].id;
      const masteryUpdates: Array<{
        studentId: string;
        masteryScore: number;
        attempts: number;
        status: string;
      }> = [];

      // For each student submission, calculate their score
      for (const submission of assessment.submissions) {
        let totalQuestions = 0;
        let correctCount = 0;

        for (const response of submission.responses) {
          totalQuestions++;
          const question = response.question;

          // Auto-grade: check if selectedOptionId matches the correct option
          if (question.correctAnswer && response.selectedOptionId) {
            if (response.selectedOptionId === question.correctAnswer) correctCount++;
          } else if (question.options.length > 0 && response.selectedOptionId) {
            const correctOption = question.options.find(o => o.isCorrect);
            if (correctOption && response.selectedOptionId === correctOption.id) correctCount++;
          }
        }

        if (totalQuestions === 0) continue;

        const scorePercent = (correctCount / totalQuestions) * 100;

        // Deterministic risk banding
        let status = 'SECURE';
        if (scorePercent < 50) status = 'URGENT';
        else if (scorePercent < 75) status = 'FRAGILE';

        masteryUpdates.push({
          studentId: submission.studentId,
          masteryScore: scorePercent,
          attempts: totalQuestions,
          status,
        });
      }

      await runTermWriteTransaction(assessment.termId, 'ACADEMIC_ACTIVITY', async tx => {
        const persistedAssessment = await tx.assessment.findUnique({
          where: { id: assessmentId },
          select: { termId: true, classId: true },
        });
        if (!persistedAssessment || persistedAssessment.termId !== assessment.termId) {
          throw new TermLifecycleError(
            'TERM_LIFECYCLE_CONFLICT',
            'Assessment term ownership changed while mastery was being calculated',
          );
        }

        for (const update of masteryUpdates) {
          await tx.learningObjectiveMastery.upsert({
            where: {
              studentId_subTopicId: {
                studentId: update.studentId,
                subTopicId: targetSubTopicId
              }
            },
            create: {
              studentId: update.studentId,
              classId: persistedAssessment.classId,
              subTopicId: targetSubTopicId,
              masteryScore: update.masteryScore,
              attempts: update.attempts,
              status: update.status
            },
            update: {
              classId: persistedAssessment.classId,
              masteryScore: update.masteryScore,
              attempts: { increment: update.attempts },
              status: update.status,
              lastAssessed: new Date()
            }
          });
        }
      });

      console.log(`[TeachingHub] Mastery updated for ${assessment.submissions.length} students.`);

      // After deterministic math, trigger the misconception engine
      await this.analyzeMisconceptions(assessmentId);

    } catch (error) {
      console.error('[TeachingHub] processAssessmentMastery error:', error);
      if (error instanceof TermLifecycleError) throw error;
    }
  }

  /**
   * STEP 2: Misconception Sifter
   * Pure data analysis. Groups the most common wrong answers per question.
   * Only invokes AI if the minimum data threshold (>= 3 same errors) is met.
   */
  static async analyzeMisconceptions(assessmentId: string) {
    try {
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          class: { include: { teacher: true } },
          subject: true,
          submissions: {
            include: {
              responses: {
                include: { question: { include: { options: true } } }
              }
            }
          }
        }
      });

      if (!assessment || !assessment.submissions.length) return;

      // Find the learning objective (SubTopic) for this assessment
      const topics = await prisma.topic.findMany({
        where: { subjectId: assessment.subjectId },
        include: { subtopics: true }
      });
      const allSubTopics = topics.flatMap(t => t.subtopics);
      if (allSubTopics.length === 0) return;
      const targetSubTopicId = allSubTopics[0].id;
      const targetSubTopicTitle = allSubTopics[0].title;

      // Count wrong answers per question
      const distractorCounts = new Map<string, Map<string, number>>();
      const questionTextMap = new Map<string, string>();

      for (const submission of assessment.submissions) {
        for (const response of submission.responses) {
          const question = response.question;
          questionTextMap.set(question.id, question.text);

          // Determine correctness
          let isCorrect = false;
          if (question.correctAnswer && response.selectedOptionId) {
            isCorrect = response.selectedOptionId === question.correctAnswer;
          } else if (question.options.length > 0 && response.selectedOptionId) {
            const correctOption = question.options.find(o => o.isCorrect);
            isCorrect = correctOption?.id === response.selectedOptionId;
          }

          if (isCorrect) continue;

          // Record the wrong answer
          const wrongChoice = response.selectedOptionId || response.answerText || 'skipped';
          if (!distractorCounts.has(question.id)) distractorCounts.set(question.id, new Map());
          const qMap = distractorCounts.get(question.id)!;
          qMap.set(wrongChoice, (qMap.get(wrongChoice) || 0) + 1);
        }
      }

      // For each question, check if any single wrong answer hit the minimum threshold
      for (const [questionId, wrongAnswerMap] of Array.from(distractorCounts.entries())) {
        const sorted = Array.from(wrongAnswerMap.entries()).sort((a, b) => b[1] - a[1]);
        const [topWrongAnswer, count] = sorted[0];

        // MINIMUM DATA THRESHOLD: at least 3 students made the exact same mistake
        if (count < 3) continue;

        const questionText = questionTextMap.get(questionId) || 'Unknown question';

        // Log the pattern in the database (deterministic)
        const pattern = await runTermWriteTransaction(
          assessment.termId,
          'ACADEMIC_ACTIVITY',
          async tx => {
            const persistedAssessment = await tx.assessment.findUnique({
              where: { id: assessmentId },
              select: { termId: true },
            });
            if (!persistedAssessment || persistedAssessment.termId !== assessment.termId) {
              throw new TermLifecycleError(
                'TERM_LIFECYCLE_CONFLICT',
                'Assessment term ownership changed while misconceptions were being analyzed',
              );
            }

            return tx.misconceptionPattern.create({
              data: {
                assessmentId,
                subTopicId: targetSubTopicId,
                studentCount: count,
                wrongAnswer: topWrongAnswer,
                description: 'Pending AI analysis...'
              }
            });
          },
        );

        // Invoke the AI to explain "why" and draft a response
        await this.generateAIDraft(
          pattern.id,
          assessment as any,
          questionText,
          topWrongAnswer,
          count,
          targetSubTopicTitle
        );
      }

    } catch (error) {
      console.error('[TeachingHub] analyzeMisconceptions error:', error);
      if (error instanceof TermLifecycleError) throw error;
    }
  }

  /**
   * STEP 3: Agentic AI Draft Generator
   * The AI receives ONLY pre-calculated data and returns a structured JSON diagnosis.
   * If the AI fails or hallucinates, we fall back to a safe generic message.
   */
  private static async generateAIDraft(
    patternId: string,
    assessment: any,
    questionText: string,
    wrongAnswer: string,
    count: number,
    subTopicTitle: string
  ) {
    const prompt = `
You are an expert teacher diagnosing a class-wide misconception.

Context:
- Subject: ${assessment.subject?.name || 'Unknown'}
- Class: ${assessment.class?.name || 'Unknown'}
- Topic: ${subTopicTitle}

The Question: "${questionText}"
${count} students incorrectly chose: "${wrongAnswer}"

As an expert pedagogue, what is the likely misconception causing these students to make this specific mistake?

Return ONLY a JSON object matching this exact format:
{
  "diagnosisTitle": "Brief title of the misconception (max 10 words)",
  "explanation": "One sentence explaining why students made this specific mistake",
  "reteachSteps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "parentNoteDraft": "A short encouraging note a teacher can send to parents to help practice this concept at home. Be specific but non-technical. Max 3 sentences."
}`;

    try {
      const aiResponse = await aiService.generateJSON<{
        diagnosisTitle: string;
        explanation: string;
        reteachSteps: string[];
        parentNoteDraft: string;
      }>(prompt, { temperature: 0.2 });

      await runTermWriteTransaction(assessment.termId, 'ACADEMIC_ACTIVITY', async tx => {
        const persistedPattern = await tx.misconceptionPattern.findUnique({
          where: { id: patternId },
          include: {
            assessment: {
              select: {
                termId: true,
                classId: true,
                class: { select: { teacherId: true } },
              },
            },
          },
        });
        if (!persistedPattern || persistedPattern.assessment.termId !== assessment.termId) {
          throw new TermLifecycleError(
            'TERM_LIFECYCLE_CONFLICT',
            'Misconception pattern term ownership changed while its draft was being generated',
          );
        }

        await tx.misconceptionPattern.update({
          where: { id: patternId },
          data: { description: aiResponse.explanation }
        });

        await tx.pendingTeacherAction.create({
          data: {
            teacherId: persistedPattern.assessment.class.teacherId,
            classId: persistedPattern.assessment.classId,
            actionType: 'RETEACH_PLAN',
            title: `Intervention: ${aiResponse.diagnosisTitle}`,
            description: `${count} students made the exact same error on "${subTopicTitle}". I've drafted a reteach plan and parent notes for your review.`,
            draftPayload: aiResponse
          }
        });
      });

      console.log(`[TeachingHub] AI draft created for misconception pattern: ${patternId}`);

    } catch (error) {
      if (error instanceof TermLifecycleError) throw error;
      console.error('[TeachingHub] AI draft generation failed:', error);

      // Safe fallback — never leave the teacher without information
      await runTermWriteTransaction(assessment.termId, 'ACADEMIC_ACTIVITY', async tx => {
        const persistedPattern = await tx.misconceptionPattern.findUnique({
          where: { id: patternId },
          include: { assessment: { select: { termId: true } } },
        });
        if (!persistedPattern || persistedPattern.assessment.termId !== assessment.termId) {
          throw new TermLifecycleError(
            'TERM_LIFECYCLE_CONFLICT',
            'Misconception pattern term ownership changed while its fallback was being saved',
          );
        }

        await tx.misconceptionPattern.update({
          where: { id: patternId },
          data: {
            description: `${count} students chose the same wrong answer on this question. Manual review recommended.`
          }
        });
      });
    }
  }

  /**
   * STEP 4: Resolve a Pending Action
   * Called when the teacher approves, edits, or dismisses a draft.
   */
  static async resolvePendingAction(actionId: string, status: 'APPROVED' | 'DISMISSED' | 'EDITED') {
    const action = await prisma.pendingTeacherAction.findUnique({
      where: { id: actionId },
      include: { class: { select: { academicTermId: true } } },
    });
    if (!action) throw new Error('Action not found');
    if (!action.class) throw new Error('Action is not linked to a term-owned class');

    return runTermWriteTransaction(action.class.academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const persistedAction = await tx.pendingTeacherAction.findUnique({
        where: { id: actionId },
        include: { class: { select: { academicTermId: true } } },
      });
      if (!persistedAction || persistedAction.class?.academicTermId !== action.class!.academicTermId) {
        throw new TermLifecycleError(
          'TERM_LIFECYCLE_CONFLICT',
          'Teacher action term ownership changed while it was being resolved',
        );
      }

      return tx.pendingTeacherAction.update({
        where: { id: actionId },
        data: {
          status,
          resolvedAt: new Date()
        }
      });
    });
  }

  /**
   * STEP 5: Log an Intervention
   * After the teacher acts (sends parent note, runs reteach), log it for the effectiveness tracker.
   */
  static async logIntervention(data: {
    teacherId: string;
    classId: string;
    subTopicId: string;
    studentIds: string[];
    strategyUsed: string;
    notes?: string;
    preScore?: number;
  }) {
    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { academicTermId: true },
    });
    if (!targetClass) throw new Error('Class not found');

    return runTermWriteTransaction(targetClass.academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const persistedClass = await tx.class.findUnique({
        where: { id: data.classId },
        select: { academicTermId: true },
      });
      if (!persistedClass || persistedClass.academicTermId !== targetClass.academicTermId) {
        throw new TermLifecycleError(
          'TERM_LIFECYCLE_CONFLICT',
          'Class term ownership changed while the intervention was being logged',
        );
      }

      return tx.interventionRecord.create({
        data: {
          teacherId: data.teacherId,
          classId: data.classId,
          subTopicId: data.subTopicId,
          studentIds: data.studentIds,
          strategyUsed: data.strategyUsed,
          notes: data.notes,
          preInterventionScore: data.preScore,
          effectiveness: 'PENDING'
        }
      });
    });
  }
}
