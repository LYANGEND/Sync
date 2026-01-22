# Teacher AI Assistant - MVP Implementation Plan

## 🎯 MVP Scope (4 Weeks)

### Core Features (Must Have)
1. **Lesson Plan Generator** - Most requested by teachers
2. **Quiz/Assessment Creator** - High time-saving potential
3. **Email Drafter** - Frequent need, easy to implement
4. **Chat Interface** - Foundation for all features

### Why These Four?
- **High Impact**: Save 5+ hours per week
- **Easy to Build**: Template-based, clear inputs/outputs
- **Teacher Validated**: Top requests from surveys
- **Foundation**: Can expand from here

---

## 🏗️ Technical Architecture

### Frontend Structure
```
/teacher/ai-assistant
├── Dashboard (Quick Actions)
├── Chat Interface
├── Template Library
├── History
└── Settings
```

### Component Hierarchy
```
TeacherAIAssistant/
├── AssistantDashboard.tsx
├── ChatInterface.tsx
├── QuickActions.tsx
├── TemplateSelector.tsx
├── GeneratedContent.tsx
└── HistoryPanel.tsx
```

### Backend Structure
```
backend/src/
├── controllers/
│   └── teacherAssistantController.ts
├── routes/
│   └── teacherAssistantRoutes.ts
├── services/
│   └── aiAssistantService.ts
└── prompts/
    ├── lessonPlanPrompts.ts
    ├── quizPrompts.ts
    └── emailPrompts.ts
```

---

## 📋 Feature Specifications

### 1. Lesson Plan Generator

#### Input Form:
```typescript
interface LessonPlanInput {
  subject: string;
  topic: string;
  gradeLevel: number;
  duration: number; // minutes
  learningObjectives?: string[];
  specialRequirements?: string; // ELL, special needs, etc.
  teachingStyle?: 'lecture' | 'hands-on' | 'group-work' | 'mixed';
}
```

#### Output Format:
```markdown
# Lesson Plan: [Topic]

**Grade Level**: [X]
**Duration**: [X] minutes
**Subject**: [Subject]

## Learning Objectives
- [Objective 1]
- [Objective 2]

## Materials Needed
- [Material 1]
- [Material 2]

## Lesson Flow

### 1. Hook/Engagement (5 min)
[Activity description]

### 2. Direct Instruction (15 min)
[Teaching content]

### 3. Guided Practice (15 min)
[Practice activity]

### 4. Independent Practice (10 min)
[Individual work]

### 5. Closure (5 min)
[Summary and assessment]

## Assessment
[How to check understanding]

## Differentiation
- **For struggling learners**: [Modifications]
- **For advanced learners**: [Extensions]
- **For ELL students**: [Accommodations]

## Homework (Optional)
[Assignment description]
```

#### UI Flow:
```
1. Click "Generate Lesson Plan"
2. Fill form (subject, topic, grade, duration)
3. Click "Generate"
4. AI creates plan (15-30 seconds)
5. Display with options: [Edit] [Save] [Export PDF] [Share]
```

---

### 2. Quiz/Assessment Creator

#### Input Form:
```typescript
interface QuizInput {
  subject: string;
  topic: string;
  gradeLevel: number;
  questionCount: number;
  questionTypes: ('multiple-choice' | 'true-false' | 'short-answer')[];
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  includeAnswerKey: boolean;
}
```

#### Output Format:
```markdown
# Quiz: [Topic]

**Grade Level**: [X]
**Total Questions**: [X]
**Estimated Time**: [X] minutes

---

## Questions

**Question 1** (Multiple Choice - Easy)
What is photosynthesis?
A) Process of eating food
B) Process of making food using sunlight ✓
C) Process of breathing
D) Process of growing

**Question 2** (True/False - Medium)
Plants release oxygen during photosynthesis.
**Answer**: True ✓

**Question 3** (Short Answer - Hard)
Explain the role of chlorophyll in photosynthesis.
**Sample Answer**: Chlorophyll is a green pigment that absorbs light energy...

---

## Answer Key

1. B - Photosynthesis is the process plants use to make food using sunlight
2. True - Plants release oxygen as a byproduct of photosynthesis
3. [Rubric for grading short answer]

---

## Grading Rubric
- Multiple Choice: 1 point each
- True/False: 1 point each
- Short Answer: 3 points (1-content, 1-clarity, 1-completeness)

**Total Points**: [X]
```

#### UI Flow:
```
1. Click "Create Quiz"
2. Fill form (topic, question count, types, difficulty)
3. Click "Generate"
4. AI creates quiz (20-40 seconds)
5. Display with options: [Edit Questions] [Save] [Export] [Add to Platform]
```

---

### 3. Email Drafter

#### Input Form:
```typescript
interface EmailInput {
  purpose: 'field-trip' | 'grades' | 'behavior' | 'event' | 'general';
  recipient: 'parent' | 'parents-group' | 'admin' | 'colleague';
  tone: 'formal' | 'friendly' | 'urgent' | 'informative';
  keyPoints: string[];
  customDetails?: string;
}
```

#### Pre-defined Templates:
```typescript
const emailTemplates = {
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
  }
};
```

#### Output Format:
```markdown
**Subject**: [Generated subject line]

Dear [Parent Name/Parents/Colleague],

[Opening paragraph - context and purpose]

[Body paragraphs - key information]

[Action items or next steps]

[Closing - professional and warm]

Best regards,
[Your Name]
[Your Title]
[Contact Information]

---

**Suggested Attachments**:
- [If applicable]

**Follow-up**:
- [Recommended timeline]
```

#### UI Flow:
```
1. Click "Draft Email"
2. Select purpose from dropdown
3. Add key points (bullet list)
4. Click "Generate"
5. AI creates email (10-15 seconds)
6. Display with options: [Edit] [Copy] [Send via Platform] [Save Template]
```

---

### 4. Chat Interface

#### Features:
- Conversational AI for any teaching question
- Context-aware (knows teacher's subjects, classes)
- Suggestion chips for common tasks
- History of conversations
- Ability to refine/regenerate responses

#### UI Design:
```
┌─────────────────────────────────────────────────┐
│ 🤖 AI Teaching Assistant              [−] [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  🤖 Good morning! How can I help you today?    │
│                                                 │
│  [📚 Plan Lesson] [✍️ Make Quiz] [💬 Email]   │
│                                                 │
│  👤 I need help with classroom management      │
│                                                 │
│  🤖 I'd be happy to help with classroom        │
│     management! What specific challenge are    │
│     you facing?                                │
│                                                 │
│     Common issues I can help with:             │
│     • Student disruptions                      │
│     • Engagement strategies                    │
│     • Transition management                    │
│     • Positive reinforcement systems           │
│                                                 │
│  👤 Students talking during instruction        │
│                                                 │
│  🤖 Here are 5 evidence-based strategies...    │
│     [Full response with actionable tips]       │
│                                                 │
│     [👍 Helpful] [👎 Not helpful] [🔄 Refine]  │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Type your message...]                    [→]  │
└─────────────────────────────────────────────────┘
```

---

## 🎨 UI/UX Design

### Main Dashboard
```
┌─────────────────────────────────────────────────────┐
│  Teacher AI Assistant                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ 🤖 "Good morning! Ready to plan today's    │  │
│  │     lessons?"                               │  │
│  │                                             │  │
│  │  Quick Actions:                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ 📚 Lesson│ │ ✍️ Quiz  │ │ 💬 Email │   │  │
│  │  │   Plan   │ │  Creator │ │  Drafter │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘   │  │
│  │                                             │  │
│  │  [💬 Chat with AI] [📚 Templates]          │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  Recent Activity:                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ 📚 Lesson: Photosynthesis (Grade 7)         │  │
│  │    Created 2 hours ago          [View] [×]  │  │
│  ├─────────────────────────────────────────────┤  │
│  │ ✍️ Quiz: World War 2 (Grade 10)             │  │
│  │    Created yesterday            [View] [×]  │  │
│  ├─────────────────────────────────────────────┤  │
│  │ 💬 Email: Field trip permission             │  │
│  │    Created 3 days ago           [View] [×]  │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  [View All History →]                               │
└─────────────────────────────────────────────────────┘
```

### Lesson Plan Generator Form
```
┌─────────────────────────────────────────────────────┐
│  Generate Lesson Plan                          [×]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Subject *                                          │
│  [Science                              ▼]          │
│                                                     │
│  Topic *                                            │
│  [Photosynthesis                                 ]  │
│                                                     │
│  Grade Level *                                      │
│  [7                                    ▼]          │
│                                                     │
│  Duration *                                         │
│  ○ 30 min  ● 45 min  ○ 60 min  ○ 90 min           │
│                                                     │
│  Learning Objectives (optional)                     │
│  [• Students will understand...                  ]  │
│  [+ Add objective]                                  │
│                                                     │
│  Teaching Style                                     │
│  ☑ Lecture  ☑ Hands-on  ☐ Group work              │
│                                                     │
│  Special Requirements (optional)                    │
│  [ELL accommodations needed                      ]  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ 💡 Tip: The more details you provide, the  │  │
│  │    better the lesson plan will be!          │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  [Cancel]                    [Generate Lesson Plan] │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation Details

### Database Schema

```sql
-- Teacher AI Assistant Conversations
CREATE TABLE teacher_ai_conversations (
  id UUID PRIMARY KEY,
  teacher_id UUID REFERENCES "User"(id),
  tenant_id UUID REFERENCES "Tenant"(id),
  title VARCHAR(255),
  type VARCHAR(50), -- 'chat', 'lesson-plan', 'quiz', 'email'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages in conversations
CREATE TABLE teacher_ai_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES teacher_ai_conversations(id),
  role VARCHAR(20), -- 'user', 'assistant'
  content TEXT,
  metadata JSONB, -- Store structured data like lesson plans
  created_at TIMESTAMP DEFAULT NOW()
);

-- Saved templates
CREATE TABLE teacher_ai_templates (
  id UUID PRIMARY KEY,
  teacher_id UUID REFERENCES "User"(id),
  tenant_id UUID REFERENCES "Tenant"(id),
  type VARCHAR(50), -- 'lesson-plan', 'quiz', 'email'
  name VARCHAR(255),
  content JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE teacher_ai_usage (
  id UUID PRIMARY KEY,
  teacher_id UUID REFERENCES "User"(id),
  tenant_id UUID REFERENCES "Tenant"(id),
  feature VARCHAR(50),
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

```typescript
// Chat
POST   /api/v1/teacher-assistant/chat
GET    /api/v1/teacher-assistant/conversations
GET    /api/v1/teacher-assistant/conversations/:id
DELETE /api/v1/teacher-assistant/conversations/:id

// Lesson Plans
POST   /api/v1/teacher-assistant/lesson-plan/generate
POST   /api/v1/teacher-assistant/lesson-plan/save
GET    /api/v1/teacher-assistant/lesson-plan/:id
PUT    /api/v1/teacher-assistant/lesson-plan/:id

// Quizzes
POST   /api/v1/teacher-assistant/quiz/generate
POST   /api/v1/teacher-assistant/quiz/save
POST   /api/v1/teacher-assistant/quiz/export
GET    /api/v1/teacher-assistant/quiz/:id

// Emails
POST   /api/v1/teacher-assistant/email/draft
POST   /api/v1/teacher-assistant/email/save-template
GET    /api/v1/teacher-assistant/email/templates

// Templates
GET    /api/v1/teacher-assistant/templates
POST   /api/v1/teacher-assistant/templates
DELETE /api/v1/teacher-assistant/templates/:id

// Usage
GET    /api/v1/teacher-assistant/usage/stats
```

### System Prompts

```typescript
// Lesson Plan System Prompt
const lessonPlanSystemPrompt = `
You are an expert educational consultant helping teachers create effective lesson plans.

Guidelines:
- Follow best practices in pedagogy
- Include clear learning objectives aligned with Bloom's Taxonomy
- Provide differentiation strategies
- Include formative assessment opportunities
- Suggest engaging activities appropriate for the grade level
- Keep timing realistic and flexible
- Include materials list
- Provide both teacher instructions and student activities

Format your response as a structured lesson plan with clear sections.
`;

// Quiz System Prompt
const quizSystemPrompt = `
You are an expert assessment designer helping teachers create effective quizzes.

Guidelines:
- Questions should align with learning objectives
- Vary difficulty levels appropriately
- Avoid trick questions
- Provide clear, unambiguous answer choices
- Include explanations in answer key
- Ensure questions test understanding, not just memorization
- Use age-appropriate language
- Avoid cultural bias

Format your response with numbered questions and a separate answer key.
`;

// Email System Prompt
const emailSystemPrompt = `
You are a professional communication assistant helping teachers draft emails.

Guidelines:
- Use appropriate tone (professional yet warm)
- Be clear and concise
- Include all necessary information
- Provide actionable next steps
- Be respectful and collaborative
- Use proper email etiquette
- Avoid educational jargon when writing to parents
- Be solution-focused

Format your response as a complete email with subject line.
`;
```

---

## 📊 Success Metrics

### Usage Metrics
- Number of teachers using assistant daily/weekly
- Features used most frequently
- Average time spent per session
- Number of items generated per teacher

### Impact Metrics
- Time saved per teacher (survey)
- Quality ratings of generated content
- Adoption rate across school
- Teacher satisfaction scores

### Technical Metrics
- Response time (target: <30 seconds)
- Error rate (target: <1%)
- Token usage per request
- API uptime (target: 99.9%)

---

## 🚀 4-Week Implementation Timeline

### Week 1: Foundation
- [ ] Set up database schema
- [ ] Create API endpoints
- [ ] Implement authentication/authorization
- [ ] Set up Azure OpenAI integration
- [ ] Create basic UI components

### Week 2: Core Features
- [ ] Lesson Plan Generator (backend + frontend)
- [ ] Quiz Creator (backend + frontend)
- [ ] Email Drafter (backend + frontend)
- [ ] Basic chat interface

### Week 3: Polish & Integration
- [ ] Template library
- [ ] History/saved items
- [ ] Export functionality (PDF, Word)
- [ ] UI/UX refinements
- [ ] Error handling

### Week 4: Testing & Launch
- [ ] Beta testing with 5-10 teachers
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] Documentation
- [ ] Soft launch

---

## 💡 Quick Start for Teachers

### First Time Setup
1. Navigate to `/teacher/ai-assistant`
2. Complete quick tutorial (2 minutes)
3. Try generating a lesson plan
4. Explore other features

### Daily Workflow
1. Morning: Generate lesson plans for the day
2. During prep: Create quizzes/assessments
3. After class: Draft parent communications
4. Anytime: Chat for teaching tips

---

## 🎯 Next Steps

1. **Validate**: Show mockups to 5 teachers, get feedback
2. **Prioritize**: Confirm MVP features based on feedback
3. **Build**: Start with Week 1 tasks
4. **Test**: Continuous testing with teacher input
5. **Launch**: Soft launch → Iterate → Full rollout

---

**Ready to revolutionize teaching with AI? Let's build this! 🚀**
