/**
 * Document Export Service
 * Handles PDF and Word document generation for lesson plans, quizzes, and emails
 * Following academic and professional formatting standards
 */

import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber, NumberFormat } from 'docx';

// ==================== CONSTANTS ====================

const COLORS = {
  primary: '#1a365d',      // Dark blue for headers
  secondary: '#2d3748',    // Dark gray for subheadings
  text: '#1a202c',         // Near black for body text
  muted: '#718096',        // Gray for meta info
  border: '#e2e8f0',       // Light gray for borders
  accent: '#3182ce',       // Blue accent
};

const FONTS = {
  title: 'Helvetica-Bold',
  heading: 'Helvetica-Bold',
  body: 'Helvetica',
  italic: 'Helvetica-Oblique',
};

// ==================== MARKDOWN PARSING ====================

/**
 * Convert markdown to plain text with basic formatting
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .trim();
}

/**
 * Parse markdown into structured sections
 */
function parseMarkdownSections(markdown: string): { title: string; content: string; level: number }[] {
  const lines = markdown.split('\n');
  const sections: { title: string; content: string; level: number }[] = [];
  let currentSection: { title: string; content: string; level: number } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headerMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: headerMatch[2],
        content: '',
        level: headerMatch[1].length,
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    } else {
      if (!sections.length || sections[0].title !== 'Overview') {
        sections.unshift({ title: 'Overview', content: line + '\n', level: 1 });
      } else {
        sections[0].content += line + '\n';
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Format date for academic documents
 */
function formatAcademicDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get grade level display text
 */
function getGradeLevelText(grade: number): string {
  if (grade === 0) return 'Kindergarten';
  if (grade === 1) return '1st Grade';
  if (grade === 2) return '2nd Grade';
  if (grade === 3) return '3rd Grade';
  if (grade >= 4 && grade <= 12) return `${grade}th Grade`;
  if (grade > 12) return `Year ${grade}`;
  return `Grade ${grade}`;
}

// ==================== LESSON PLAN PDF ====================

export async function generateLessonPlanPDF(
  content: string,
  metadata: {
    subject: string;
    topic: string;
    gradeLevel: number;
    duration: number;
    teacherName?: string;
    schoolName?: string;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 72, // 1 inch margins (academic standard)
        size: 'A4', 
        bufferPages: true,
        info: {
          Title: `Lesson Plan: ${metadata.topic}`,
          Author: metadata.teacherName || 'Teacher',
          Subject: metadata.subject,
          Creator: 'Sync School Management System',
        }
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 144; // Account for margins
      const currentDate = formatAcademicDate();

      // === HEADER SECTION ===
      if (metadata.schoolName) {
        doc.fontSize(10).font(FONTS.body).fillColor(COLORS.muted)
          .text(metadata.schoolName.toUpperCase(), { align: 'center' });
        doc.moveDown(0.3);
      }

      // Title
      doc.fontSize(24).font(FONTS.title).fillColor(COLORS.primary)
        .text('LESSON PLAN', { align: 'center' });
      doc.moveDown(0.5);

      // Decorative line
      doc.strokeColor(COLORS.accent).lineWidth(2)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(1);

      // === METADATA TABLE ===
      const metaStartY = doc.y;
      const col1X = 72;
      const col2X = doc.page.width / 2 + 20;
      
      doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text);
      
      // Left column
      doc.font(FONTS.heading).text('Subject:', col1X, metaStartY);
      doc.font(FONTS.body).text(metadata.subject, col1X + 60, metaStartY);
      
      doc.font(FONTS.heading).text('Topic:', col1X, metaStartY + 20);
      doc.font(FONTS.body).text(metadata.topic, col1X + 60, metaStartY + 20);
      
      doc.font(FONTS.heading).text('Duration:', col1X, metaStartY + 40);
      doc.font(FONTS.body).text(`${metadata.duration} minutes`, col1X + 60, metaStartY + 40);

      // Right column
      doc.font(FONTS.heading).text('Grade Level:', col2X, metaStartY);
      doc.font(FONTS.body).text(getGradeLevelText(metadata.gradeLevel), col2X + 80, metaStartY);
      
      doc.font(FONTS.heading).text('Date:', col2X, metaStartY + 20);
      doc.font(FONTS.body).text(currentDate, col2X + 80, metaStartY + 20);
      
      if (metadata.teacherName) {
        doc.font(FONTS.heading).text('Teacher:', col2X, metaStartY + 40);
        doc.font(FONTS.body).text(metadata.teacherName, col2X + 80, metaStartY + 40);
      }

      doc.y = metaStartY + 70;
      
      // Separator line
      doc.strokeColor(COLORS.border).lineWidth(1)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(1);

      // === CONTENT SECTIONS ===
      const sections = parseMarkdownSections(content);
      
      sections.forEach((section, sectionIndex) => {
        // Only check for page break if we have content to render
        const hasContent = section.content.trim().length > 0;
        const needsSpace = doc.y > doc.page.height - 150;
        
        // Page break check - only if there's more content to come
        if (needsSpace && (hasContent || sectionIndex < sections.length - 1)) {
          doc.addPage();
        }

        // Section heading with colored background
        if (section.level === 1) {
          doc.fontSize(14).font(FONTS.heading).fillColor(COLORS.primary);
          // Draw section header background
          doc.rect(72, doc.y - 3, pageWidth, 22).fill('#f7fafc');
          doc.fillColor(COLORS.primary).text(section.title.toUpperCase(), 80, doc.y);
        } else if (section.level === 2) {
          doc.fontSize(12).font(FONTS.heading).fillColor(COLORS.secondary);
          doc.text(section.title);
        } else {
          doc.fontSize(11).font(FONTS.heading).fillColor(COLORS.text);
          doc.text(section.title);
        }
        
        doc.moveDown(0.5);

        // Section content with proper formatting
        doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text);
        const contentLines = section.content.trim().split('\n').filter(line => line.trim());
        
        contentLines.forEach((line, lineIndex) => {
          // Check for page break - only if there's more content after this line
          if (doc.y > doc.page.height - 100 && lineIndex < contentLines.length - 1) {
            doc.addPage();
          }

          // Handle bullet points
          const bulletMatch = line.match(/^[•\-*]\s+(.+)$/);
          const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
          
          if (bulletMatch) {
            doc.text(`    •  ${bulletMatch[1]}`, { indent: 20, lineGap: 3 });
          } else if (numberedMatch) {
            doc.text(`    ${numberedMatch[1]}.  ${numberedMatch[2]}`, { indent: 20, lineGap: 3 });
          } else {
            const cleanLine = markdownToPlainText(line);
            if (cleanLine) {
              doc.text(cleanLine, { lineGap: 3 });
            }
          }
        });
        
        doc.moveDown(0.8);
      });

      // === FOOTER ON ALL PAGES ===
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Footer line
        doc.strokeColor(COLORS.border).lineWidth(0.5)
          .moveTo(72, doc.page.height - 60).lineTo(doc.page.width - 72, doc.page.height - 60).stroke();
        
        // Page number
        doc.fontSize(9).font(FONTS.body).fillColor(COLORS.muted);
        doc.text(
          `Page ${i + 1} of ${pages.count}`,
          72,
          doc.page.height - 45,
          { align: 'center', width: pageWidth }
        );
        
        // Footer text
        doc.fontSize(8).font(FONTS.italic)
          .text(
            `Generated by Sync School Management System • ${currentDate}`,
            72,
            doc.page.height - 32,
            { align: 'center', width: pageWidth }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ==================== LESSON PLAN WORD ====================

export async function generateLessonPlanWord(
  content: string,
  metadata: {
    subject: string;
    topic: string;
    gradeLevel: number;
    duration: number;
    teacherName?: string;
    schoolName?: string;
  }
): Promise<Buffer> {
  const sections = parseMarkdownSections(content);
  const docChildren: Paragraph[] = [];
  const currentDate = formatAcademicDate();

  // School name if available
  if (metadata.schoolName) {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: metadata.schoolName.toUpperCase(),
            size: 20,
            color: COLORS.muted.replace('#', ''),
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  }

  // Title
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'LESSON PLAN',
          bold: true,
          size: 48,
          color: COLORS.primary.replace('#', ''),
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Metadata table
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Subject: ', bold: true, size: 22 }),
                  new TextRun({ text: metadata.subject, size: 22 }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Grade Level: ', bold: true, size: 22 }),
                  new TextRun({ text: getGradeLevelText(metadata.gradeLevel), size: 22 }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Topic: ', bold: true, size: 22 }),
                  new TextRun({ text: metadata.topic, size: 22 }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Date: ', bold: true, size: 22 }),
                  new TextRun({ text: currentDate, size: 22 }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Duration: ', bold: true, size: 22 }),
                  new TextRun({ text: `${metadata.duration} minutes`, size: 22 }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: metadata.teacherName ? [
                  new TextRun({ text: 'Teacher: ', bold: true, size: 22 }),
                  new TextRun({ text: metadata.teacherName, size: 22 }),
                ] : [],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  docChildren.push(new Paragraph({ children: [] }));
  
  // Separator
  docChildren.push(
    new Paragraph({
      border: {
        bottom: { color: COLORS.accent.replace('#', ''), space: 1, style: BorderStyle.SINGLE, size: 12 },
      },
      spacing: { after: 300 },
    })
  );

  // Content sections
  sections.forEach((section) => {
    const headingLevel =
      section.level === 1 ? HeadingLevel.HEADING_1 :
      section.level === 2 ? HeadingLevel.HEADING_2 :
      HeadingLevel.HEADING_3;

    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.level === 1 ? section.title.toUpperCase() : section.title,
            bold: true,
            size: section.level === 1 ? 28 : section.level === 2 ? 24 : 22,
            color: section.level === 1 ? COLORS.primary.replace('#', '') : COLORS.secondary.replace('#', ''),
          }),
        ],
        heading: headingLevel,
        spacing: { before: 300, after: 150 },
        shading: section.level === 1 ? { fill: 'f7fafc' } : undefined,
      })
    );

    // Content lines
    const contentLines = section.content.trim().split('\n');
    contentLines.forEach((line) => {
      if (!line.trim()) {
        docChildren.push(new Paragraph({ text: '', spacing: { after: 100 } }));
        return;
      }

      const bulletMatch = line.match(/^[•\-*]\s+(.+)$/);
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      
      if (bulletMatch) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: bulletMatch[1], size: 22 })],
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
      } else if (numberedMatch) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: numberedMatch[2], size: 22 })],
            numbering: { reference: 'default-numbering', level: 0 },
            spacing: { after: 80 },
          })
        );
      } else {
        const cleanLine = markdownToPlainText(line);
        if (cleanLine) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: cleanLine, size: 22 })],
              spacing: { after: 120 },
            })
          );
        }
      }
    });
  });

  // Create document with header and footer
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${metadata.subject} - ${metadata.topic}`,
                    size: 18,
                    color: COLORS.muted.replace('#', ''),
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                  new TextRun({ text: ' of ', size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
                  new TextRun({ text: '  •  Generated by Sync School Management System', size: 16, italics: true, color: COLORS.muted.replace('#', '') }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [metaTable, ...docChildren],
      },
    ],
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
  });

  return await Packer.toBuffer(doc);
}

// ==================== QUIZ EXPORT ====================

export async function generateQuizPDF(
  content: string,
  metadata: {
    subject: string;
    topic: string;
    gradeLevel: number;
    questionCount: number;
    teacherName?: string;
    schoolName?: string;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 72, 
        size: 'A4', 
        bufferPages: true,
        info: {
          Title: `Quiz: ${metadata.topic}`,
          Author: metadata.teacherName || 'Teacher',
          Subject: metadata.subject,
          Creator: 'Sync School Management System',
        }
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 144;
      const currentDate = formatAcademicDate();

      // Header
      if (metadata.schoolName) {
        doc.fontSize(10).font(FONTS.body).fillColor(COLORS.muted)
          .text(metadata.schoolName.toUpperCase(), { align: 'center' });
        doc.moveDown(0.3);
      }

      doc.fontSize(22).font(FONTS.title).fillColor(COLORS.primary)
        .text('ASSESSMENT / QUIZ', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(14).font(FONTS.body).fillColor(COLORS.secondary)
        .text(metadata.topic, { align: 'center' });
      
      doc.moveDown(0.5);
      doc.strokeColor(COLORS.accent).lineWidth(2)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(0.8);

      // Student info section
      doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text);
      doc.text('Name: _________________________________     Date: _______________     Class: _________');
      doc.moveDown(0.8);

      // Quiz info box
      doc.rect(72, doc.y, pageWidth, 50).stroke(COLORS.border);
      const boxY = doc.y + 10;
      doc.fontSize(10).font(FONTS.body);
      doc.text(`Subject: ${metadata.subject}`, 82, boxY);
      doc.text(`Grade Level: ${getGradeLevelText(metadata.gradeLevel)}`, 82, boxY + 15);
      doc.text(`Total Questions: ${metadata.questionCount}`, 300, boxY);
      doc.text(`Total Marks: ______`, 300, boxY + 15);
      doc.y = boxY + 55;

      // Instructions
      doc.fontSize(11).font(FONTS.heading).fillColor(COLORS.primary)
        .text('INSTRUCTIONS:', { underline: true });
      doc.fontSize(10).font(FONTS.body).fillColor(COLORS.text)
        .text('• Read each question carefully before answering.')
        .text('• Write your answers clearly in the space provided.')
        .text('• Show all your work where applicable.');
      doc.moveDown(1);

      doc.strokeColor(COLORS.border).lineWidth(0.5)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(0.8);

      // Questions content
      const sections = parseMarkdownSections(content);
      
      sections.forEach((section, sectionIndex) => {
        const hasContent = section.content.trim().length > 0;
        const needsSpace = doc.y > doc.page.height - 150;
        
        if (needsSpace && (hasContent || sectionIndex < sections.length - 1)) {
          doc.addPage();
        }

        if (section.level === 1) {
          doc.fontSize(12).font(FONTS.heading).fillColor(COLORS.primary)
            .text(section.title.toUpperCase());
        } else {
          doc.fontSize(11).font(FONTS.heading).fillColor(COLORS.secondary)
            .text(section.title);
        }
        
        doc.moveDown(0.4);
        doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text);
        
        const contentLines = section.content.trim().split('\n').filter(line => line.trim());
        contentLines.forEach((line, lineIndex) => {
          if (doc.y > doc.page.height - 100 && lineIndex < contentLines.length - 1) {
            doc.addPage();
          }

          const cleanLine = markdownToPlainText(line);
          if (cleanLine) {
            doc.text(cleanLine, { lineGap: 3 });
          }
        });
        
        doc.moveDown(0.6);
      });

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor(COLORS.border).lineWidth(0.5)
          .moveTo(72, doc.page.height - 60).lineTo(doc.page.width - 72, doc.page.height - 60).stroke();
        doc.fontSize(9).font(FONTS.body).fillColor(COLORS.muted);
        doc.text(`Page ${i + 1} of ${pages.count}`, 72, doc.page.height - 45, { align: 'center', width: pageWidth });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateQuizWord(
  content: string,
  metadata: {
    subject: string;
    topic: string;
    gradeLevel: number;
    questionCount: number;
    teacherName?: string;
    schoolName?: string;
  }
): Promise<Buffer> {
  const sections = parseMarkdownSections(content);
  const docChildren: Paragraph[] = [];
  const currentDate = formatAcademicDate();

  // School name
  if (metadata.schoolName) {
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: metadata.schoolName.toUpperCase(), size: 20, color: COLORS.muted.replace('#', '') })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  }

  // Title
  docChildren.push(
    new Paragraph({
      children: [new TextRun({ text: 'ASSESSMENT / QUIZ', bold: true, size: 44, color: COLORS.primary.replace('#', '') })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: metadata.topic, size: 28, color: COLORS.secondary.replace('#', '') })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Student info
  docChildren.push(
    new Paragraph({
      children: [new TextRun({ text: 'Name: _________________________________     Date: _______________     Class: _________', size: 22 })],
      spacing: { after: 200 },
    })
  );

  // Quiz info
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Subject: ', bold: true, size: 22 }),
        new TextRun({ text: `${metadata.subject}     `, size: 22 }),
        new TextRun({ text: 'Grade: ', bold: true, size: 22 }),
        new TextRun({ text: `${getGradeLevelText(metadata.gradeLevel)}     `, size: 22 }),
        new TextRun({ text: 'Questions: ', bold: true, size: 22 }),
        new TextRun({ text: `${metadata.questionCount}`, size: 22 }),
      ],
      spacing: { after: 200 },
      border: { bottom: { color: COLORS.border.replace('#', ''), style: BorderStyle.SINGLE, size: 6 } },
    })
  );

  // Instructions
  docChildren.push(
    new Paragraph({
      children: [new TextRun({ text: 'INSTRUCTIONS:', bold: true, size: 22, underline: {} })],
      spacing: { before: 200, after: 100 },
    }),
    new Paragraph({ children: [new TextRun({ text: '• Read each question carefully before answering.', size: 20 })], spacing: { after: 50 } }),
    new Paragraph({ children: [new TextRun({ text: '• Write your answers clearly in the space provided.', size: 20 })], spacing: { after: 50 } }),
    new Paragraph({ children: [new TextRun({ text: '• Show all your work where applicable.', size: 20 })], spacing: { after: 200 } })
  );

  // Content sections
  sections.forEach((section) => {
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: section.level === 1 ? section.title.toUpperCase() : section.title, bold: true, size: section.level === 1 ? 26 : 24, color: COLORS.primary.replace('#', '') })],
        spacing: { before: 200, after: 100 },
      })
    );

    const contentLines = section.content.trim().split('\n');
    contentLines.forEach((line) => {
      if (!line.trim()) return;
      const cleanLine = markdownToPlainText(line);
      if (cleanLine) {
        docChildren.push(
          new Paragraph({ children: [new TextRun({ text: cleanLine, size: 22 })], spacing: { after: 100 } })
        );
      }
    });
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Page ', size: 18 }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                new TextRun({ text: ' of ', size: 18 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: docChildren,
    }],
  });

  return await Packer.toBuffer(doc);
}

// ==================== EMAIL EXPORT ====================

export async function generateEmailPDF(
  content: string,
  metadata: {
    purpose: string;
    recipient: string;
    teacherName?: string;
    schoolName?: string;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 72, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 144;
      const currentDate = formatAcademicDate();

      // Letterhead style header
      if (metadata.schoolName) {
        doc.fontSize(14).font(FONTS.heading).fillColor(COLORS.primary)
          .text(metadata.schoolName, { align: 'center' });
        doc.moveDown(0.3);
      }

      doc.fontSize(18).font(FONTS.title).fillColor(COLORS.primary)
        .text('OFFICIAL CORRESPONDENCE', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.strokeColor(COLORS.accent).lineWidth(1.5)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(1);

      // Email metadata
      doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text);
      doc.font(FONTS.heading).text('Date: ', { continued: true });
      doc.font(FONTS.body).text(currentDate);
      
      doc.font(FONTS.heading).text('To: ', { continued: true });
      doc.font(FONTS.body).text(metadata.recipient);
      
      if (metadata.teacherName) {
        doc.font(FONTS.heading).text('From: ', { continued: true });
        doc.font(FONTS.body).text(metadata.teacherName);
      }
      
      doc.font(FONTS.heading).text('Re: ', { continued: true });
      doc.font(FONTS.body).text(metadata.purpose);
      
      doc.moveDown(1);
      doc.strokeColor(COLORS.border).lineWidth(0.5)
        .moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke();
      doc.moveDown(1);

      // Email content
      const plainContent = markdownToPlainText(content);
      doc.fontSize(11).font(FONTS.body).fillColor(COLORS.text)
        .text(plainContent, { align: 'left', lineGap: 4 });

      // Footer
      doc.moveDown(2);
      doc.fontSize(9).font(FONTS.italic).fillColor(COLORS.muted)
        .text('This document was generated by Sync School Management System.', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
