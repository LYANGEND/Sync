/**
 * Academic AI Service
 * Specialized prompts and functions for academic-focused AI features
 */

// ==================== STANDARDS-ALIGNED CONTENT ====================

export const standardsAlignedSystemPrompt = `You are an expert educational content creator specializing in standards-aligned instruction.

Your role is to:
1. Create content that explicitly addresses curriculum standards
2. Write measurable learning objectives using Bloom's taxonomy
3. Include prerequisite skills and connections to future learning
4. Ensure academic rigor appropriate for the grade level
5. Provide clear success criteria for students

Always:
- Map content to specific standards codes
- Use precise educational terminology
- Include formative assessment opportunities
- Consider diverse learners
- Ground recommendations in educational research`;

export function generateStandardsAlignedPrompt(data: {
  standards: string[];  // Array of standard codes
  subject: string;
  gradeLevel: number;
  duration: number;
  teachingStyle?: string;
}) {
  return `Create a standards-aligned lesson plan with the following specifications:

STANDARDS TO ADDRESS:
${data.standards.map(s => `- ${s}`).join('\n')}

LESSON DETAILS:
- Subject: ${data.subject}
- Grade Level: ${data.gradeLevel}
- Duration: ${data.duration} minutes
- Teaching Style: ${data.teachingStyle || 'Mixed methods'}

REQUIRED COMPONENTS:

1. STANDARDS ALIGNMENT
   - List each standard code
   - Explain how the lesson addresses each standard
   - Identify the primary vs. secondary standards

2. LEARNING OBJECTIVES (Measurable, using Bloom's taxonomy)
   - State what students will know/be able to do
   - Include the cognitive level (remember, understand, apply, etc.)
   - Make them observable and measurable

3. SUCCESS CRITERIA
   - Clear indicators of mastery
   - What does success look like?
   - How will students know they've achieved the objective?

4. PREREQUISITE SKILLS
   - What should students already know?
   - How will you check for prerequisite knowledge?
   - What will you do if students lack prerequisites?

5. LESSON STRUCTURE
   - Hook/Engagement (5-10% of time)
   - Direct Instruction (20-30% of time)
   - Guided Practice (30-40% of time)
   - Independent Practice (20-30% of time)
   - Closure/Assessment (5-10% of time)

6. FORMATIVE ASSESSMENT
   - How will you check for understanding throughout?
   - What questions will you ask?
   - What will you look for in student work?

7. DIFFERENTIATION
   - Support for struggling learners
   - Extensions for advanced learners
   - Accommodations for special needs

8. CONNECTIONS
   - How does this connect to previous learning?
   - How does this prepare for future learning?
   - Real-world applications

Format the response in clear sections with headers.`;
}

// ==================== BLOOM'S TAXONOMY QUESTIONS ====================

export const bloomsQuestionSystemPrompt = `You are an expert assessment designer specializing in Bloom's Taxonomy and cognitive rigor.

Your role is to:
1. Create questions at specific cognitive levels
2. Ensure questions are clear, unambiguous, and grade-appropriate
3. Provide high-quality distractors for multiple choice questions
4. Include detailed rubrics for open-ended questions
5. Balance question difficulty and cognitive demand

Bloom's Taxonomy Levels:
- REMEMBER: Recall facts, terms, concepts (define, list, identify)
- UNDERSTAND: Explain ideas or concepts (describe, explain, summarize)
- APPLY: Use information in new situations (solve, demonstrate, calculate)
- ANALYZE: Draw connections, examine relationships (compare, contrast, categorize)
- EVALUATE: Justify decisions or positions (critique, judge, assess)
- CREATE: Produce new or original work (design, construct, develop)

Always:
- Match question complexity to grade level
- Use clear, precise language
- Avoid trick questions or ambiguity
- Provide context when needed
- Include answer keys with explanations`;

export function generateBloomsQuestionsPrompt(data: {
  topic: string;
  subject: string;
  gradeLevel: number;
  distribution: {
    remember?: number;
    understand?: number;
    apply?: number;
    analyze?: number;
    evaluate?: number;
    create?: number;
  };
  questionType: 'multiple-choice' | 'short-answer' | 'essay' | 'mixed';
}) {
  const total = Object.values(data.distribution).reduce((sum, val) => sum + (val || 0), 0);
  
  return `Create ${total} assessment questions on the following topic:

TOPIC: ${data.topic}
SUBJECT: ${data.subject}
GRADE LEVEL: ${data.gradeLevel}
QUESTION TYPE: ${data.questionType}

BLOOM'S TAXONOMY DISTRIBUTION:
${data.distribution.remember ? `- REMEMBER: ${data.distribution.remember} questions` : ''}
${data.distribution.understand ? `- UNDERSTAND: ${data.distribution.understand} questions` : ''}
${data.distribution.apply ? `- APPLY: ${data.distribution.apply} questions` : ''}
${data.distribution.analyze ? `- ANALYZE: ${data.distribution.analyze} questions` : ''}
${data.distribution.evaluate ? `- EVALUATE: ${data.distribution.evaluate} questions` : ''}
${data.distribution.create ? `- CREATE: ${data.distribution.create} questions` : ''}

REQUIREMENTS FOR EACH QUESTION:

1. QUESTION TEXT
   - Clear and unambiguous
   - Grade-appropriate vocabulary
   - Includes necessary context

2. BLOOM'S LEVEL
   - Explicitly state the cognitive level
   - Ensure the question actually requires that level of thinking

3. FOR MULTIPLE CHOICE:
   - One correct answer
   - 3-4 plausible distractors
   - Distractors based on common misconceptions
   - Avoid "all of the above" or "none of the above"

4. FOR SHORT ANSWER/ESSAY:
   - Clear expectations for response
   - Rubric with point values
   - Example of strong response

5. ANSWER KEY
   - Correct answer with explanation
   - Why other options are incorrect (for MC)
   - Common student errors to watch for

6. DEPTH OF KNOWLEDGE (DOK)
   - Indicate DOK level (1-4)
   - Ensure alignment with Bloom's level

Format each question clearly with all components.`;
}

// ==================== DIFFERENTIATION ENGINE ====================

export const differentiationSystemPrompt = `You are an expert in differentiated instruction and Universal Design for Learning (UDL).

Your role is to:
1. Create multiple versions of content for different learning levels
2. Maintain the same learning objectives across all versions
3. Adjust complexity, scaffolding, and support appropriately
4. Ensure all versions are academically rigorous
5. Provide specific, actionable modifications

Differentiation Strategies:
- CONTENT: What students learn (complexity, depth, breadth)
- PROCESS: How students learn (scaffolding, pacing, grouping)
- PRODUCT: How students demonstrate learning (options, support)
- ENVIRONMENT: Learning conditions (structure, flexibility)

Always:
- Maintain high expectations for all learners
- Provide appropriate challenge at each level
- Include specific supports and scaffolds
- Consider multiple means of representation
- Ensure accessibility`;

export function generateDifferentiatedContentPrompt(data: {
  originalContent: string;
  subject: string;
  gradeLevel: number;
  levels: ('below' | 'on-level' | 'above' | 'ell' | 'accessible')[];
}) {
  return `Create differentiated versions of the following content:

ORIGINAL CONTENT:
${data.originalContent}

SUBJECT: ${data.subject}
GRADE LEVEL: ${data.gradeLevel}

CREATE VERSIONS FOR:
${data.levels.map(level => `- ${level.toUpperCase()}`).join('\n')}

FOR EACH VERSION, PROVIDE:

1. MODIFIED CONTENT
   - Adjusted for the target audience
   - Maintains core learning objectives
   - Appropriate complexity and depth

2. SPECIFIC MODIFICATIONS MADE
   - What was changed and why
   - Vocabulary adjustments
   - Scaffolding added or removed
   - Pacing considerations

3. INSTRUCTIONAL SUPPORTS
   - Visual aids needed
   - Manipulatives or tools
   - Graphic organizers
   - Technology supports

4. ASSESSMENT ADJUSTMENTS
   - How to assess this version
   - Success criteria for this level
   - Accommodations needed

DIFFERENTIATION GUIDELINES:

BELOW GRADE LEVEL:
- Simpler vocabulary (1-2 grade levels below)
- More scaffolding and structure
- Shorter tasks, more frequent checks
- Visual supports and models
- Partner or small group work
- Focus on foundational concepts

ON GRADE LEVEL:
- Grade-appropriate vocabulary
- Balanced scaffolding
- Standard task length
- Mix of support and independence
- Variety of grouping structures
- Full depth of content

ABOVE GRADE LEVEL:
- Advanced vocabulary
- Minimal scaffolding
- Extended, complex tasks
- Independent work emphasis
- Open-ended challenges
- Deeper exploration, connections

ELL (English Language Learners):
- Simplified sentence structure
- Key vocabulary pre-taught
- Visual supports and realia
- Sentence frames and stems
- Bilingual resources if possible
- More processing time

ACCESSIBLE (Special Needs):
- Clear, simple language
- Chunked information
- Dyslexia-friendly formatting
- Alternative formats (audio, visual)
- Extended time
- Assistive technology options

Format each version clearly with all components.`;
}

// ==================== MISCONCEPTION DETECTOR ====================

export const misconceptionSystemPrompt = `You are an expert in identifying and addressing common student misconceptions across all subjects.

Your role is to:
1. Identify common misconceptions for specific topics
2. Explain why these misconceptions occur
3. Provide research-based intervention strategies
4. Create diagnostic questions to check for misconceptions
5. Suggest resources and activities to address them

Always:
- Base recommendations on educational research
- Provide specific, actionable strategies
- Include formative assessment methods
- Consider developmental appropriateness
- Offer multiple intervention approaches`;

export function generateMisconceptionAnalysisPrompt(data: {
  topic: string;
  subject: string;
  gradeLevel: number;
}) {
  return `Identify and address common student misconceptions for:

TOPIC: ${data.topic}
SUBJECT: ${data.subject}
GRADE LEVEL: ${data.gradeLevel}

FOR EACH MISCONCEPTION, PROVIDE:

1. THE MISCONCEPTION
   - Clear statement of the incorrect understanding
   - How students typically express this

2. WHY IT HAPPENS
   - Cognitive reasons (prior knowledge, intuition)
   - Instructional factors
   - Developmental considerations

3. EVIDENCE OF THE MISCONCEPTION
   - What you'll see in student work
   - Common errors or patterns
   - Verbal indicators

4. INTERVENTION STRATEGIES
   - Specific teaching approaches
   - Activities to address the misconception
   - Visual models or representations
   - Questioning techniques

5. DIAGNOSTIC QUESTIONS
   - Questions to check for this misconception
   - What correct vs. incorrect responses look like
   - Follow-up questions to probe understanding

6. RESOURCES
   - Manipulatives or tools
   - Videos or simulations
   - Worksheets or activities
   - Technology resources

7. PREVENTION
   - How to teach this topic to avoid the misconception
   - Key points to emphasize
   - Common teaching mistakes to avoid

Identify 3-5 major misconceptions for this topic.`;
}

// ==================== FORMATIVE ASSESSMENT ====================

export const formativeAssessmentSystemPrompt = `You are an expert in formative assessment and checking for understanding.

Your role is to:
1. Create quick, effective checks for understanding
2. Design assessments that inform instruction
3. Provide clear success criteria
4. Include multiple assessment methods
5. Make assessments actionable for teachers

Always:
- Keep assessments brief and focused
- Align with learning objectives
- Provide clear rubrics or answer keys
- Include next-step recommendations
- Consider diverse learners`;

export function generateFormativeAssessmentPrompt(data: {
  topic: string;
  learningObjectives: string[];
  assessmentType: 'exit-ticket' | 'think-pair-share' | 'quick-quiz' | 'whiteboard-check' | 'four-corners';
  duration: number;
}) {
  return `Create a formative assessment with the following specifications:

TOPIC: ${data.topic}
TYPE: ${data.assessmentType}
DURATION: ${data.duration} minutes

LEARNING OBJECTIVES TO ASSESS:
${data.learningObjectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

PROVIDE:

1. ASSESSMENT INSTRUCTIONS
   - Clear directions for students
   - Materials needed
   - Time allocation

2. ASSESSMENT CONTENT
   - Questions or prompts
   - Response format
   - Space for student work

3. SUCCESS CRITERIA
   - What does mastery look like?
   - What indicates partial understanding?
   - What shows lack of understanding?

4. SCORING GUIDE
   - Point values or rubric
   - Quick scoring method
   - What to look for in responses

5. NEXT STEPS BASED ON RESULTS
   - If most students succeed: Extension activities
   - If some students struggle: Small group intervention
   - If most students struggle: Re-teach whole class

6. COMMON ERRORS TO WATCH FOR
   - Typical mistakes
   - What they indicate about understanding
   - How to address them

Make it practical and easy to implement in a real classroom.`;
}

// ==================== DEMO CONTENT ====================

export function generateDemoStandardsLesson(data: any): string {
  return `# Standards-Aligned Lesson Plan: ${data.topic}

## Standards Addressed

**Primary Standard:**
- ${data.standards[0] || 'CCSS.MATH.5.NF.A.1'}: Add and subtract fractions with unlike denominators

**Secondary Standards:**
- CCSS.MATH.PRACTICE.MP1: Make sense of problems and persevere in solving them
- CCSS.MATH.PRACTICE.MP4: Model with mathematics

## Learning Objectives

By the end of this lesson, students will be able to:
1. **Apply** the process of finding common denominators to add fractions (Bloom's: Apply)
2. **Explain** why fractions need common denominators to be added (Bloom's: Understand)
3. **Solve** real-world problems involving fraction addition (Bloom's: Apply)

## Success Criteria

Students will demonstrate mastery by:
- Finding common denominators for any pair of fractions
- Adding fractions with unlike denominators with 80% accuracy
- Explaining their reasoning using mathematical vocabulary

## Prerequisite Skills Check

Students should already be able to:
- Identify equivalent fractions
- Find the least common multiple (LCM)
- Add fractions with like denominators

**Quick Check:** "Add 1/4 + 2/4. Show your work."

## Lesson Structure (${data.duration} minutes)

### Hook (5 minutes)
Present a real-world problem: "You ate 1/3 of a pizza and your friend ate 1/4. How much pizza did you eat together?"

### Direct Instruction (15 minutes)
1. Review equivalent fractions
2. Demonstrate finding common denominators
3. Model the addition process step-by-step
4. Think-aloud to show reasoning

### Guided Practice (15 minutes)
Work through 3 examples together:
- Easy: 1/2 + 1/4
- Medium: 2/3 + 1/6
- Challenging: 3/4 + 2/5

### Independent Practice (10 minutes)
Students complete 5 problems independently
- Monitor and provide feedback
- Identify students needing support

### Closure (5 minutes)
Exit ticket: "Explain in your own words how to add fractions with different denominators."

## Formative Assessment

Throughout the lesson:
- Thumbs up/down checks
- Whiteboard responses
- Observation during guided practice
- Exit ticket analysis

## Differentiation

**Below Grade Level:**
- Use fraction strips/manipulatives
- Start with simpler denominators (2, 4, 8)
- Provide step-by-step checklist
- Partner with on-level student

**On Grade Level:**
- Standard instruction as outlined
- Mix of concrete and abstract
- Variety of problem types

**Above Grade Level:**
- Add three or more fractions
- Create their own word problems
- Explore why the algorithm works
- Peer tutoring opportunities

## Connections

**Previous Learning:** Equivalent fractions, LCM
**Future Learning:** Subtracting fractions, adding mixed numbers
**Real-World:** Cooking, construction, time management

---

*This lesson is designed to be academically rigorous while supporting all learners.*`;
}

export function generateDemoBloomsQuestions(data: any): string {
  return `# Bloom's Taxonomy Assessment: ${data.topic}

## Question Distribution
- Remember: ${data.distribution.remember || 2} questions
- Understand: ${data.distribution.understand || 3} questions
- Apply: ${data.distribution.apply || 3} questions
- Analyze: ${data.distribution.analyze || 2} questions

---

## REMEMBER LEVEL (DOK 1)

**Question 1:**
What are the three main components needed for photosynthesis?

**Answer:** Light energy, water (H₂O), and carbon dioxide (CO₂)

**Bloom's Level:** Remember
**DOK Level:** 1 (Recall)

---

**Question 2:**
Define the term "chlorophyll."

**Answer:** Chlorophyll is the green pigment in plants that absorbs light energy for photosynthesis.

**Bloom's Level:** Remember
**DOK Level:** 1 (Recall)

---

## UNDERSTAND LEVEL (DOK 2)

**Question 3:**
Explain why plants need sunlight for photosynthesis.

**Rubric:**
- 3 points: Explains that sunlight provides energy to power the chemical reaction
- 2 points: States sunlight is needed but doesn't explain why
- 1 point: Vague or incomplete explanation
- 0 points: Incorrect or no response

**Example Strong Response:** "Plants need sunlight because it provides the energy needed to convert carbon dioxide and water into glucose and oxygen. Without light energy, the chemical reaction cannot occur."

**Bloom's Level:** Understand
**DOK Level:** 2 (Skill/Concept)

---

## APPLY LEVEL (DOK 2)

**Question 4:**
A plant is placed in a dark closet for one week. Predict what will happen to the plant and explain why.

**Rubric:**
- 4 points: Predicts plant will die/wilt AND explains lack of photosynthesis AND mentions glucose production stops
- 3 points: Predicts plant will die AND explains lack of photosynthesis
- 2 points: Predicts plant will die but explanation is incomplete
- 1 point: Prediction only, no explanation
- 0 points: Incorrect prediction

**Bloom's Level:** Apply
**DOK Level:** 2 (Skill/Concept)

---

## ANALYZE LEVEL (DOK 3)

**Question 5:**
Compare and contrast photosynthesis and cellular respiration. Create a Venn diagram showing at least 3 similarities and 3 differences.

**Rubric:**
- 5 points: Accurate Venn diagram with 3+ similarities and 3+ differences, all correct
- 4 points: Venn diagram with 2-3 similarities and 2-3 differences, mostly correct
- 3 points: Venn diagram with some correct information but missing key points
- 2 points: Attempt made but significant errors
- 1 point: Minimal effort
- 0 points: No response

**Key Points:**
Similarities: Both involve energy transformation, both occur in cells, both involve gases
Differences: Photosynthesis produces glucose/oxygen, respiration breaks down glucose, opposite processes

**Bloom's Level:** Analyze
**DOK Level:** 3 (Strategic Thinking)

---

*These questions are designed to assess understanding at multiple cognitive levels.*`;
}
