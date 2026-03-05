import { PrismaClient } from '@prisma/client';
import aiService from './aiService';

const prisma = new PrismaClient() as any;

interface GradingResult {
  questionId: string;
  score: number;
  maxPoints: number;
  feedback: string;
  confidence: number;
}

/**
 * AI Auto-Grading Service
 * Handles grading of SHORT_ANSWER and ESSAY question types using AI
 */
class AutoGradingService {

  /**
   * Grade a student's submission using AI for text-based answers
   */
  async gradeSubmission(submissionId: string): Promise<{
    totalScore: number;
    results: GradingResult[];
    autoGradedCount: number;
    manualGradedCount: number;
  }> {
    const submission = await prisma.assessmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        responses: {
          include: {
            question: {
              include: { options: true }
            },
          },
        },
        assessment: {
          include: { subject: true },
        },
      },
    });

    if (!submission) throw new Error('Submission not found');

    const results: GradingResult[] = [];
    let autoGraded = 0;
    let manualGraded = 0;

    for (const response of submission.responses) {
      const question = response.question;

      switch (question.type) {
        case 'MULTIPLE_CHOICE':
        case 'TRUE_FALSE': {
          // Auto-grade MC/TF by checking selected option
          const selectedOption = question.options.find(
            (o: any) => o.id === response.selectedOptionId
          );
          const isCorrect = selectedOption?.isCorrect || false;
          results.push({
            questionId: question.id,
            score: isCorrect ? question.points : 0,
            maxPoints: question.points,
            feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer was: ${question.correctAnswer || 'See correct option'}`,
            confidence: 1.0,
          });
          autoGraded++;
          break;
        }

        case 'SHORT_ANSWER': {
          const grading = await this.gradeShortAnswer(
            question.text,
            response.answerText || '',
            question.correctAnswer || '',
            question.points,
            submission.assessment.subject?.name || 'General'
          );
          results.push(grading);
          autoGraded++;
          break;
        }

        case 'ESSAY': {
          const grading = await this.gradeEssay(
            question.text,
            response.answerText || '',
            question.points,
            submission.assessment.subject?.name || 'General'
          );
          results.push(grading);
          autoGraded++;
          break;
        }
      }
    }

    // Calculate total score
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);

    // Update submission
    await prisma.assessmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: totalScore,
        status: 'GRADED',
      },
    });

    return {
      totalScore,
      results,
      autoGradedCount: autoGraded,
      manualGradedCount: manualGraded,
    };
  }

  /**
   * Grade a short answer question using AI
   */
  private async gradeShortAnswer(
    question: string,
    studentAnswer: string,
    correctAnswer: string,
    maxPoints: number,
    subject: string
  ): Promise<GradingResult> {
    const isAIAvailable = await aiService.isAvailable();

    if (!isAIAvailable) {
      // Fallback: simple string matching
      return this.fallbackGradeShortAnswer(question, studentAnswer, correctAnswer, maxPoints);
    }

    try {
      const prompt = `Grade this short answer question for a ${subject} class.

Question: ${question}
Expected Answer: ${correctAnswer}
Student's Answer: ${studentAnswer}
Maximum Points: ${maxPoints}

Grade the student's answer. Consider partial credit for partially correct answers.
Respond with JSON: { "score": <number 0-${maxPoints}>, "feedback": "<brief feedback>", "confidence": <0.0-1.0> }`;

      const result = await aiService.generateJSON<{ score: number; feedback: string; confidence: number }>(prompt, {
        systemPrompt: 'You are a fair and accurate teacher grading student work. Be generous with partial credit but firm on accuracy.',
        temperature: 0.2,
      });

      return {
        questionId: '', // Will be set by caller
        score: Math.min(maxPoints, Math.max(0, result.score)),
        maxPoints,
        feedback: result.feedback,
        confidence: result.confidence,
      };
    } catch {
      return this.fallbackGradeShortAnswer(question, studentAnswer, correctAnswer, maxPoints);
    }
  }

  /**
   * Grade an essay question using AI
   */
  private async gradeEssay(
    question: string,
    studentAnswer: string,
    maxPoints: number,
    subject: string
  ): Promise<GradingResult> {
    const isAIAvailable = await aiService.isAvailable();

    if (!isAIAvailable || !studentAnswer.trim()) {
      return {
        questionId: '',
        score: 0,
        maxPoints,
        feedback: studentAnswer.trim() ? 'Manual grading required - AI not available' : 'No answer provided',
        confidence: studentAnswer.trim() ? 0 : 1,
      };
    }

    try {
      const prompt = `Grade this essay response for a ${subject} class.

Question: ${question}
Student's Essay: ${studentAnswer}
Maximum Points: ${maxPoints}

Evaluate based on:
1. Relevance to the question (30%)
2. Content accuracy and depth (30%)
3. Organization and coherence (20%)
4. Language and expression (20%)

Respond with JSON: { "score": <number 0-${maxPoints}>, "feedback": "<constructive feedback with strengths and areas for improvement>", "confidence": <0.0-1.0> }`;

      const result = await aiService.generateJSON<{ score: number; feedback: string; confidence: number }>(prompt, {
        systemPrompt: 'You are an experienced teacher grading essays. Provide fair scores with constructive feedback. Consider the student may be in a Zambian school context.',
        temperature: 0.3,
      });

      return {
        questionId: '',
        score: Math.min(maxPoints, Math.max(0, result.score)),
        maxPoints,
        feedback: result.feedback + ' [AI-graded - teacher review recommended]',
        confidence: result.confidence,
      };
    } catch {
      return {
        questionId: '',
        score: 0,
        maxPoints,
        feedback: 'AI grading failed - manual grading required',
        confidence: 0,
      };
    }
  }

  /**
   * Fallback grading using string similarity
   */
  private fallbackGradeShortAnswer(
    question: string,
    studentAnswer: string,
    correctAnswer: string,
    maxPoints: number
  ): GradingResult {
    if (!studentAnswer.trim()) {
      return {
        questionId: '',
        score: 0,
        maxPoints,
        feedback: 'No answer provided',
        confidence: 1,
      };
    }

    const normalizedStudent = studentAnswer.toLowerCase().trim();
    const normalizedCorrect = correctAnswer.toLowerCase().trim();

    // Exact match
    if (normalizedStudent === normalizedCorrect) {
      return {
        questionId: '',
        score: maxPoints,
        maxPoints,
        feedback: 'Correct!',
        confidence: 1,
      };
    }

    // Check if answer contains the key words
    const correctWords = normalizedCorrect.split(/\s+/).filter(w => w.length > 3);
    const matchedWords = correctWords.filter(w => normalizedStudent.includes(w));
    const matchRatio = correctWords.length > 0 ? matchedWords.length / correctWords.length : 0;

    if (matchRatio >= 0.8) {
      return {
        questionId: '',
        score: maxPoints,
        maxPoints,
        feedback: 'Answer appears correct',
        confidence: 0.7,
      };
    } else if (matchRatio >= 0.5) {
      const partialScore = Math.round(maxPoints * matchRatio);
      return {
        questionId: '',
        score: partialScore,
        maxPoints,
        feedback: 'Partially correct - review recommended',
        confidence: 0.4,
      };
    }

    return {
      questionId: '',
      score: 0,
      maxPoints,
      feedback: 'Answer does not match expected response - manual review recommended',
      confidence: 0.3,
    };
  }

  /**
   * Generate item analysis for an assessment
   * Identifies which questions students struggle with most
   */
  async generateItemAnalysis(assessmentId: string): Promise<{
    questions: Array<{
      questionId: string;
      questionText: string;
      avgScore: number;
      maxPoints: number;
      percentCorrect: number;
      commonMistakes: string[];
      difficulty: string;
    }>;
    overallStats: {
      averageScore: number;
      highestScore: number;
      lowestScore: number;
      submissionCount: number;
    };
  }> {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          include: { options: true },
        },
        submissions: {
          where: { status: 'GRADED' },
          include: {
            responses: true,
          },
        },
      },
    });

    if (!assessment) throw new Error('Assessment not found');

    const questionAnalysis = assessment.questions.map((question: any) => {
      const responses = assessment.submissions.flatMap((s: any) =>
        s.responses.filter((r: any) => r.questionId === question.id)
      );

      const scores: number[] = [];
      const wrongAnswers: string[] = [];

      responses.forEach((response: any) => {
        if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
          const selectedOption = question.options.find((o: any) => o.id === response.selectedOptionId);
          if (selectedOption?.isCorrect) {
            scores.push(question.points);
          } else {
            scores.push(0);
            if (selectedOption) wrongAnswers.push(selectedOption.text);
          }
        }
      });

      const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
      const percentCorrect = scores.length > 0 ? (scores.filter(s => s > 0).length / scores.length) * 100 : 0;

      // Determine difficulty
      let difficulty = 'MEDIUM';
      if (percentCorrect >= 80) difficulty = 'EASY';
      else if (percentCorrect <= 40) difficulty = 'HARD';

      // Find most common wrong answers
      const wrongAnswerCounts = new Map<string, number>();
      wrongAnswers.forEach(a => wrongAnswerCounts.set(a, (wrongAnswerCounts.get(a) || 0) + 1));
      const commonMistakes = Array.from(wrongAnswerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([answer]) => answer);

      return {
        questionId: question.id,
        questionText: question.text,
        avgScore: Math.round(avgScore * 100) / 100,
        maxPoints: question.points,
        percentCorrect: Math.round(percentCorrect),
        commonMistakes,
        difficulty,
      };
    });

    // Overall stats
    const submissionScores = assessment.submissions.map((s: any) => Number(s.score || 0));
    const overallStats = {
      averageScore: submissionScores.length > 0 ? submissionScores.reduce((a: number, b: number) => a + b, 0) / submissionScores.length : 0,
      highestScore: submissionScores.length > 0 ? Math.max(...submissionScores) : 0,
      lowestScore: submissionScores.length > 0 ? Math.min(...submissionScores) : 0,
      submissionCount: assessment.submissions.length,
    };

    return {
      questions: questionAnalysis,
      overallStats,
    };
  }
}

export const autoGradingService = new AutoGradingService();
export default autoGradingService;
