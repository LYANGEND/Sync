/**
 * AI Assistant Service for Teacher Tools
 * Provides prompts and utilities for lesson plans, quizzes, and email drafting
 */

// System Prompts for different features
export const lessonPlanSystemPrompt = `You are an expert educational consultant and instructional designer with deep knowledge of pedagogical frameworks, curriculum standards, and evidence-based teaching practices.

Professional Standards & Frameworks:
- Align learning objectives with Bloom's Taxonomy (revised) and Webb's Depth of Knowledge
- Apply Understanding by Design (UbD) backward design principles
- Incorporate research-based instructional strategies (Marzano, Hattie's Visible Learning)
- Follow Universal Design for Learning (UDL) principles for accessibility
- Consider the Zambian ECZ curriculum standards and competency-based education

Pedagogical Excellence:
- Write SMART learning objectives (Specific, Measurable, Achievable, Relevant, Time-bound)
- Include both formative and summative assessment strategies
- Provide scaffolding techniques and gradual release of responsibility
- Integrate 21st-century skills (critical thinking, collaboration, communication, creativity)
- Include metacognitive strategies to help students monitor their own learning
- Address multiple intelligences and learning modalities (visual, auditory, kinesthetic)
- Incorporate culturally responsive teaching practices

Academic Rigor:
- Ensure cognitive demand matches grade-level expectations
- Include higher-order thinking questions (analysis, evaluation, creation)
- Provide academic vocabulary development strategies
- Connect to real-world applications and cross-curricular links
- Include evidence-based engagement strategies backed by educational research

Format your response as a comprehensive, professionally structured lesson plan using markdown with clear academic sections.`;

export const quizSystemPrompt = `You are an expert assessment designer helping teachers create effective quizzes.

Guidelines:
- Questions should align with learning objectives
- Vary difficulty levels appropriately
- Avoid trick questions
- Provide clear, unambiguous answer choices
- Include explanations in answer key
- Ensure questions test understanding, not just memorization
- Use age-appropriate language
- Avoid cultural bias

Format your response with numbered questions and a separate answer key using markdown.`;

export const emailSystemPrompt = `You are a professional communication assistant helping teachers draft emails.

Guidelines:
- Use appropriate tone (professional yet warm)
- Be clear and concise
- Include all necessary information
- Provide actionable next steps
- Be respectful and collaborative
- Use proper email etiquette
- Avoid educational jargon when writing to parents
- Be solution-focused

Format your response as a complete email with subject line using markdown.`;

export const gradingFeedbackSystemPrompt = `You are an educational feedback specialist helping teachers provide constructive feedback.

Guidelines:
- Start with positive observations
- Be specific about areas for improvement
- Provide actionable suggestions
- Use encouraging language that promotes growth mindset
- Avoid discouraging or harsh criticism
- Consider the student's grade level

Format your response with clear sections for strengths, areas for improvement, and suggestions.`;

export const chatSystemPrompt = `You are an AI Teaching Assistant designed to help teachers with their daily tasks.

You can help with:
1. Lesson Planning - Creating engaging lesson plans
2. Quiz Creation - Generating assessments and questions
3. Email Drafting - Writing professional communications
4. Grading Feedback - Providing constructive feedback suggestions
5. Teaching Strategies - Classroom management and pedagogical tips
6. Curriculum Alignment - ECZ curriculum guidance

Always be helpful, professional, and provide practical, actionable advice.
Keep responses concise but comprehensive.`;

// Lesson Plan Template Generator
export function generateLessonPlanPrompt(input: {
    subject: string;
    topic: string;
    gradeLevel: number;
    duration: number;
    learningObjectives?: string[];
    specialRequirements?: string;
    teachingStyle?: 'lecture' | 'hands-on' | 'group-work' | 'mixed';
    curriculumStandards?: string[];
    priorKnowledge?: string;
    assessmentType?: 'formative' | 'summative' | 'both';
    technologyIntegration?: boolean;
    crossCurricularLinks?: string[];
}): string {
    const objectivesSection = input.learningObjectives?.length
        ? `\n\nTeacher-Specified Learning Objectives:\n${input.learningObjectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}`
        : '';

    const requirementsSection = input.specialRequirements
        ? `\n\nSpecial Requirements/Accommodations: ${input.specialRequirements}`
        : '';

    const styleSection = input.teachingStyle
        ? `\n\nPreferred Teaching Approach: ${input.teachingStyle}`
        : '';

    const standardsSection = input.curriculumStandards?.length
        ? `\n\nCurriculum Standards to Address:\n${input.curriculumStandards.map((std, i) => `${i + 1}. ${std}`).join('\n')}`
        : '';

    const priorKnowledgeSection = input.priorKnowledge
        ? `\n\nExpected Prior Knowledge: ${input.priorKnowledge}`
        : '';

    const assessmentSection = input.assessmentType
        ? `\n\nAssessment Focus: ${input.assessmentType === 'formative' ? 'Formative (ongoing checks for understanding)' : input.assessmentType === 'summative' ? 'Summative (end-of-lesson/unit assessment)' : 'Both formative and summative'}`
        : '';

    const technologySection = input.technologyIntegration
        ? `\n\nTechnology Integration: Include appropriate digital tools and resources`
        : '';

    const crossCurricularSection = input.crossCurricularLinks?.length
        ? `\n\nCross-Curricular Connections to: ${input.crossCurricularLinks.join(', ')}`
        : '';

    return `Create a comprehensive, academically rigorous ${input.duration}-minute lesson plan for teaching "${input.topic}" in ${input.subject} to Grade ${input.gradeLevel} students.${objectivesSection}${styleSection}${requirementsSection}${standardsSection}${priorKnowledgeSection}${assessmentSection}${technologySection}${crossCurricularSection}

Please structure the lesson plan with the following professional components:

## 1. LESSON OVERVIEW
- **Title**: Clear, descriptive lesson title
- **Grade Level**: ${input.gradeLevel}
- **Subject**: ${input.subject}
- **Duration**: ${input.duration} minutes
- **Curriculum Standards**: ${input.curriculumStandards?.length ? 'Address the specified standards above' : 'Relevant ECZ curriculum competencies or international standards'}
- **Prerequisites**: ${input.priorKnowledge || 'Prior knowledge students should have'}

## 2. LEARNING OBJECTIVES (SMART Format)
Write 3-5 measurable objectives using Bloom's Taxonomy action verbs:
- At least one lower-order objective (Remember/Understand)
- At least one higher-order objective (Apply/Analyze/Evaluate/Create)
- Include Webb's DOK level for each objective (DOK 1-4)
- Format: "Students will be able to [action verb] [content] [condition/criteria]"

## 3. ESSENTIAL QUESTIONS
2-3 open-ended questions that guide inquiry and critical thinking

## 4. ACADEMIC VOCABULARY
Key terms with student-friendly definitions and context

## 5. MATERIALS & RESOURCES
- Physical materials needed
- Digital resources/technology${input.technologyIntegration ? ' (emphasize technology integration)' : ''}
- Handouts/worksheets
- Assessment tools

## 6. INSTRUCTIONAL SEQUENCE (with timing)

### A. ANTICIPATORY SET / HOOK (${Math.ceil(input.duration * 0.1)} min)
- Engaging opening activity to activate prior knowledge
- Connection to real-world context or student interests
- Preview of learning objectives

### B. DIRECT INSTRUCTION (${Math.ceil(input.duration * 0.25)} min)
- Clear explanation of concepts with examples
- Modeling and think-aloud strategies
- Visual aids, demonstrations, or multimedia
- Checking for understanding (CFU) questions

### C. GUIDED PRACTICE (${Math.ceil(input.duration * 0.30)} min)
- Scaffolded activities with teacher support
- Collaborative learning opportunities
- Formative assessment checkpoints
- Gradual release of responsibility

### D. INDEPENDENT PRACTICE (${Math.ceil(input.duration * 0.25)} min)
- Individual application of skills/knowledge
- Differentiated tasks by readiness level
- Student choice elements (where appropriate)

### E. CLOSURE & ASSESSMENT (${Math.ceil(input.duration * 0.10)} min)
- Summary of key learning points
- Exit ticket or quick formative assessment
- Preview of next lesson connection

## 7. ASSESSMENT STRATEGIES

### Formative Assessment (During Lesson):
- Specific CFU techniques (thumbs up/down, whiteboards, questioning)
- Observation criteria
- Student self-assessment opportunities

### Summative Assessment (End of Unit):
- Suggested assessment aligned with objectives
- Success criteria/rubric outline

## 8. DIFFERENTIATION (UDL Framework)

### Multiple Means of Representation:
- For visual learners
- For auditory learners
- For kinesthetic learners

### Multiple Means of Engagement:
- For struggling learners (scaffolding strategies)
- For advanced learners (extension/enrichment)
- For English Language Learners (language support)
- For students with special needs

### Multiple Means of Expression:
- Alternative ways students can demonstrate learning

## 9. HIGHER-ORDER THINKING QUESTIONS
Provide 5-7 questions across Bloom's levels:
- 2 Remembering/Understanding questions
- 2 Applying/Analyzing questions
- 2-3 Evaluating/Creating questions

## 10. CROSS-CURRICULAR CONNECTIONS
${input.crossCurricularLinks?.length ? `Links to: ${input.crossCurricularLinks.join(', ')}` : 'Links to other subjects (literacy, numeracy, science, social studies, arts)'}

## 11. 21ST CENTURY SKILLS INTEGRATION
- Critical Thinking opportunities
- Collaboration strategies
- Communication activities
- Creativity elements

## 12. HOMEWORK/EXTENSION (Optional)
- Meaningful practice that reinforces learning
- Estimated time: [X] minutes
- Parent involvement suggestions (if appropriate)

## 13. REFLECTION & NOTES
- Teacher reflection prompts
- Anticipated challenges and solutions
- Modifications for next time

## 14. REFERENCES & RESOURCES
- Educational research supporting strategies used
- Additional teacher resources
- Student resources for extended learning

Make this lesson plan professional, evidence-based, and immediately implementable by a teacher.`;
}

// Quiz Generation Prompt
export function generateQuizPrompt(input: {
    subject: string;
    topic: string;
    gradeLevel: number;
    questionCount: number;
    questionTypes: ('multiple-choice' | 'true-false' | 'short-answer')[];
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
    includeAnswerKey: boolean;
}): string {
    const typesDescription = input.questionTypes.join(', ');

    return `Create a ${input.questionCount}-question quiz on "${input.topic}" for Grade ${input.gradeLevel} ${input.subject}.

Requirements:
- Question Types: ${typesDescription}
- Difficulty Level: ${input.difficulty}
- Age-appropriate language for Grade ${input.gradeLevel}

Please provide:
1. **Quiz Header** with title, subject, grade level, and estimated time
2. **Questions** numbered 1 through ${input.questionCount}
   - For multiple-choice: 4 options (A, B, C, D)
   - For true/false: Clear statements
   - For short-answer: Clear question with expected answer length
3. ${input.includeAnswerKey ? '**Answer Key** with correct answers and brief explanations' : '(Answer key not needed)'}
4. **Grading Rubric** showing how to score each question type

For ${input.difficulty === 'mixed' ? 'mixed difficulty' : `${input.difficulty} difficulty`}, ensure questions ${input.difficulty === 'easy' ? 'test basic recall and understanding' :
            input.difficulty === 'medium' ? 'require application and analysis' :
                input.difficulty === 'hard' ? 'require analysis, synthesis, and evaluation' :
                    'range from basic recall to higher-order thinking'
        }.`;
}

// Email Draft Prompt
export function generateEmailPrompt(input: {
    purpose: 'field-trip' | 'grades' | 'behavior' | 'event' | 'general';
    recipient: 'parent' | 'parents-group' | 'admin' | 'colleague';
    tone: 'formal' | 'friendly' | 'urgent' | 'informative';
    keyPoints: string[];
    customDetails?: string;
    teacherName?: string;
    schoolName?: string;
}): string {
    const purposeContext = {
        'field-trip': 'a field trip permission request and information',
        'grades': 'academic progress or grade updates',
        'behavior': 'behavioral observations or concerns (constructively)',
        'event': 'an upcoming school event or activity',
        'general': 'general school communication'
    };

    const recipientContext = {
        'parent': 'an individual parent/guardian',
        'parents-group': 'a group of parents (use appropriate greeting)',
        'admin': 'school administration',
        'colleague': 'a fellow teacher'
    };

    const toneContext = {
        'formal': 'professional and formal',
        'friendly': 'warm and approachable',
        'urgent': 'urgent but professional',
        'informative': 'clear and informative'
    };

    const keyPointsList = input.keyPoints.length > 0
        ? `\n\nKey points to include:\n${input.keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}`
        : '';

    const customSection = input.customDetails
        ? `\n\nAdditional context: ${input.customDetails}`
        : '';

    return `Draft a professional email regarding ${purposeContext[input.purpose]}.

Context:
- Recipient: ${recipientContext[input.recipient]}
- Tone: ${toneContext[input.tone]}
${input.teacherName ? `- Teacher Name: ${input.teacherName}` : '- Teacher Name: [Your Name]'}
${input.schoolName ? `- School Name: ${input.schoolName}` : '- School Name: [School Name]'}
${keyPointsList}${customSection}

Please provide:
1. **Subject Line** - Clear and professional
2. **Email Body** with:
   - Appropriate greeting
   - Clear opening paragraph stating purpose
   - Body with key information
   - Action items or next steps (if applicable)
   - Professional closing
3. **Suggested Attachments** (if relevant)
4. **Follow-up Timeline** (if applicable)

Make the email ${input.tone} while remaining professional and clear.`;
}

// Grading Feedback Prompt
export function generateGradingFeedbackPrompt(input: {
    studentWork: string;
    assignmentType: string;
    gradeLevel: number;
    rubricCriteria?: string[];
}): string {
    const criteriaSection = input.rubricCriteria?.length
        ? `\n\nRubric Criteria to evaluate:\n${input.rubricCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
        : '';

    return `Provide constructive feedback for a Grade ${input.gradeLevel} student's ${input.assignmentType}.
${criteriaSection}

Student's Work:
---
${input.studentWork}
---

Please provide:
1. **Strengths** - What the student did well (be specific)
2. **Areas for Improvement** - Specific areas to work on
3. **Suggestions** - Actionable steps to improve
4. **Personalized Comment** - A growth-mindset encouraging comment

Keep feedback appropriate for the grade level and encouraging.`;
}

// Email Templates
export const emailTemplates = {
    'field-trip': {
        subject: 'Upcoming Field Trip - Action Required',
        structure: ['greeting', 'announcement', 'details', 'action-required', 'closing']
    },
    'grades': {
        subject: 'Update on [Student Name]\'s Academic Progress',
        structure: ['greeting', 'positive-note', 'concern', 'action-plan', 'closing']
    },
    'behavior': {
        subject: 'Classroom Behavior Discussion',
        structure: ['greeting', 'observation', 'concern', 'collaboration', 'closing']
    },
    'event': {
        subject: 'Upcoming Event Notification',
        structure: ['greeting', 'announcement', 'details', 'participation', 'closing']
    },
    'general': {
        subject: 'Important Update from [School]',
        structure: ['greeting', 'purpose', 'details', 'action', 'closing']
    }
};

// Demo responses for when API is not configured
export function generateDemoLessonPlan(input: any): string {
    return `# Lesson Plan: ${input.topic}

**Grade Level**: ${input.gradeLevel}
**Duration**: ${input.duration} minutes
**Subject**: ${input.subject}

## Learning Objectives
- Students will understand the key concepts of ${input.topic}
- Students will be able to apply knowledge in practical scenarios
- Students will demonstrate comprehension through assessment

## Materials Needed
- Whiteboard and markers
- Student worksheets
- Visual aids/diagrams
- Assessment rubric

## Lesson Flow

### 1. Hook/Engagement (5 min)
Start with an engaging question or demonstration related to ${input.topic} to capture student attention.

### 2. Direct Instruction (15 min)
Present the main concepts of ${input.topic} using visual aids and clear explanations.

### 3. Guided Practice (15 min)
Work through examples together as a class, checking for understanding.

### 4. Independent Practice (10 min)
Students work on practice problems individually.

### 5. Closure (5 min)
Review key points and conduct exit ticket assessment.

## Assessment
Exit ticket with 3 questions to check understanding.

## Differentiation
- **For struggling learners**: Provide visual aids and scaffolded worksheets
- **For advanced learners**: Extension activities and challenge problems
- **For ELL students**: Visual vocabulary support and peer assistance

## Homework (Optional)
Review worksheet on ${input.topic} - 10 practice problems

---
*Generated by AI Teaching Assistant (Demo Mode)*`;
}

export function generateDemoQuiz(input: any): string {
    return `# Quiz: ${input.topic}

**Grade Level**: ${input.gradeLevel}
**Subject**: ${input.subject}
**Total Questions**: ${input.questionCount}
**Estimated Time**: ${input.questionCount * 2} minutes

---

## Questions

**Question 1** (Multiple Choice - ${input.difficulty === 'mixed' ? 'Easy' : input.difficulty})
What is the main concept of ${input.topic}?
A) Option A
B) Option B (Correct Answer)
C) Option C
D) Option D

**Question 2** (True/False - ${input.difficulty === 'mixed' ? 'Medium' : input.difficulty})
Statement about ${input.topic} is true.
**Answer**: True

**Question 3** (Short Answer - ${input.difficulty === 'mixed' ? 'Medium' : input.difficulty})
Explain how ${input.topic} works in your own words.
**Sample Answer**: A brief explanation demonstrating understanding of the concept...

---

## Answer Key

1. B - Explanation of why this is correct
2. True - Supporting information
3. [Rubric for grading short answer]

---

## Grading Rubric
- Multiple Choice: 1 point each
- True/False: 1 point each
- Short Answer: 3 points (1-content, 1-clarity, 1-completeness)

**Total Points**: ${input.questionCount + 2}

---
*Generated by AI Teaching Assistant (Demo Mode)*`;
}

export function generateDemoEmail(input: any): string {
    return `**Subject**: ${emailTemplates[input.purpose as keyof typeof emailTemplates]?.subject || 'Important Update'}

Dear ${input.recipient === 'parent' ? 'Parent/Guardian' : input.recipient === 'parents-group' ? 'Parents and Guardians' : input.recipient === 'admin' ? 'School Administration' : 'Colleague'},

I hope this message finds you well. I am writing to inform you about ${input.purpose === 'field-trip' ? 'an upcoming field trip' : input.purpose === 'grades' ? 'academic progress updates' : input.purpose === 'behavior' ? 'classroom observations' : input.purpose === 'event' ? 'an upcoming event' : 'an important matter'}.

${input.keyPoints?.length > 0 ? input.keyPoints.map((point: string) => `• ${point}`).join('\n') : '• Details to be filled in'}

${input.customDetails || 'Additional information will be provided as needed.'}

**Action Required**:
Please respond or take necessary action by the specified deadline.

If you have any questions or concerns, please don't hesitate to reach out.

Best regards,
${input.teacherName || '[Your Name]'}
${input.schoolName || '[School Name]'}

---

**Suggested Attachments**:
- Permission slip (if applicable)
- Additional information sheet

**Follow-up**:
- Recommended response within 1 week

---
*Generated by AI Teaching Assistant (Demo Mode)*`;
}
