import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lightbulb, 
  BookOpen, 
  Target, 
  CheckCircle2, 
  AlertCircle,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import katex from 'katex';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

interface VisualExplanationProps {
  content: string;
}

// Renders KaTeX math equations
const MathRenderer = ({ math, display = false }: { math: string; display?: boolean }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(math, ref.current, {
          displayMode: display,
          throwOnError: false,
          errorColor: '#ef4444',
        });
      } catch (e) {
        console.error('KaTeX error:', e);
      }
    }
  }, [math, display]);

  return <span ref={ref} className={display ? 'block my-4 overflow-x-auto' : 'inline'} />;
};

// Renders Mermaid diagrams
const DiagramRenderer = ({ code }: { code: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code.trim()) return;
      
      try {
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        setSvg(svg);
        setError('');
      } catch (e: any) {
        console.error('Mermaid error:', e);
        setError('Could not render diagram');
      }
    };

    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
        <AlertCircle size={16} className="inline mr-2" />
        {error}
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative my-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-800 dark:to-slate-700 rounded-xl border border-blue-200 dark:border-slate-600 overflow-hidden"
      >
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 bg-white/80 dark:bg-slate-700/80 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors"
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <div 
          ref={containerRef}
          className="flex justify-center overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </motion.div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setIsFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-4xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsFullscreen(false)}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X size={20} />
              </button>
              <div 
                className="flex justify-center"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Visual concept card
interface ConceptCardProps {
  type: 'definition' | 'example' | 'tip' | 'warning' | 'step';
  title: string;
  content: string;
  stepNumber?: number;
}

const ConceptCard = ({ type, title, content, stepNumber }: ConceptCardProps) => {
  const configs = {
    definition: {
      icon: BookOpen,
      bg: 'from-blue-500 to-cyan-500',
      border: 'border-blue-300 dark:border-blue-700',
      lightBg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    example: {
      icon: Lightbulb,
      bg: 'from-amber-500 to-orange-500',
      border: 'border-amber-300 dark:border-amber-700',
      lightBg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    tip: {
      icon: Target,
      bg: 'from-green-500 to-emerald-500',
      border: 'border-green-300 dark:border-green-700',
      lightBg: 'bg-green-50 dark:bg-green-900/20',
    },
    warning: {
      icon: AlertCircle,
      bg: 'from-red-500 to-pink-500',
      border: 'border-red-300 dark:border-red-700',
      lightBg: 'bg-red-50 dark:bg-red-900/20',
    },
    step: {
      icon: CheckCircle2,
      bg: 'from-purple-500 to-indigo-500',
      border: 'border-purple-300 dark:border-purple-700',
      lightBg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`my-4 rounded-xl border ${config.border} ${config.lightBg} overflow-hidden`}
    >
      <div className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${config.bg} text-white`}>
        {type === 'step' && stepNumber ? (
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
            {stepNumber}
          </div>
        ) : (
          <Icon size={18} />
        )}
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="p-4 text-sm text-gray-700 dark:text-gray-300">
        {content}
      </div>
    </motion.div>
  );
};

// Step-by-step visual progress
interface StepProgressProps {
  steps: { title: string; completed: boolean }[];
  currentStep: number;
}

export const StepProgress = ({ steps, currentStep }: StepProgressProps) => {
  return (
    <div className="my-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-800 dark:to-slate-700 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-900 dark:text-white">Lesson Progress</h4>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>
      <div className="relative">
        {/* Progress line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 dark:bg-slate-600" />
        <div 
          className="absolute top-4 left-4 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />
        
        {/* Steps */}
        <div className="relative flex justify-between">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col items-center">
              <motion.div
                initial={false}
                animate={{
                  scale: index === currentStep ? 1.2 : 1,
                  backgroundColor: index <= currentStep ? '#6366f1' : '#e5e7eb',
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  index <= currentStep ? 'text-white' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {index < currentStep ? <CheckCircle2 size={16} /> : index + 1}
              </motion.div>
              <span className={`mt-2 text-xs text-center max-w-[60px] ${
                index === currentStep ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Image carousel for visual examples
interface ImageCarouselProps {
  images: { url: string; caption: string }[];
}

export const ImageCarousel = ({ images }: ImageCarouselProps) => {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((c) => (c + 1) % images.length);
  const prev = () => setCurrent((c) => (c - 1 + images.length) % images.length);

  if (images.length === 0) return null;

  return (
    <div className="my-4 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800">
      <div className="relative aspect-video">
        <AnimatePresence mode="wait">
          <motion.img
            key={current}
            src={images[current].url}
            alt={images[current].caption}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full h-full object-contain"
          />
        </AnimatePresence>
        
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      <div className="p-3 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{images[current].caption}</p>
        {images.length > 1 && (
          <div className="flex justify-center gap-1 mt-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === current ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Main visual explanation renderer
const VisualExplanation = ({ content }: VisualExplanationProps) => {
  const elements: JSX.Element[] = [];
  let key = 0;

  // Split content and parse visual elements
  const lines = content.split('\n');
  let currentText = '';
  let inCodeBlock = false;
  let codeBlockType = '';
  let codeBlockContent = '';

  const flushText = () => {
    if (currentText.trim()) {
      // Process inline math and text
      const parts = currentText.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);
      const textElements: (string | JSX.Element)[] = [];
      
      parts.forEach((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          // Display math
          textElements.push(
            <MathRenderer key={`math-${key}-${i}`} math={part.slice(2, -2)} display />
          );
        } else if (part.startsWith('$') && part.endsWith('$')) {
          // Inline math
          textElements.push(
            <MathRenderer key={`math-${key}-${i}`} math={part.slice(1, -1)} />
          );
        } else if (part.trim()) {
          // Regular text with markdown-like formatting
          const formattedPart = part
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
          textElements.push(
            <span key={`text-${key}-${i}`} dangerouslySetInnerHTML={{ __html: formattedPart }} />
          );
        }
      });

      if (textElements.length > 0) {
        elements.push(
          <p key={key++} className="mb-2 leading-relaxed">
            {textElements}
          </p>
        );
      }
      currentText = '';
    }
  };

  for (const line of lines) {
    // Handle code blocks (mermaid diagrams)
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        flushText();
        inCodeBlock = true;
        codeBlockType = line.slice(3).trim().toLowerCase();
        codeBlockContent = '';
      } else {
        if (codeBlockType === 'mermaid') {
          elements.push(<DiagramRenderer key={key++} code={codeBlockContent} />);
        } else {
          // Regular code block
          elements.push(
            <pre key={key++} className="my-4 p-4 bg-gray-900 text-gray-100 rounded-xl overflow-x-auto text-sm font-mono">
              <code>{codeBlockContent}</code>
            </pre>
          );
        }
        inCodeBlock = false;
        codeBlockType = '';
        codeBlockContent = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line;
      continue;
    }

    // Handle concept cards with special syntax
    // [DEFINITION: title] content
    const definitionMatch = line.match(/^\[DEFINITION:\s*(.+?)\]\s*(.*)$/i);
    if (definitionMatch) {
      flushText();
      elements.push(
        <ConceptCard key={key++} type="definition" title={definitionMatch[1]} content={definitionMatch[2]} />
      );
      continue;
    }

    // [EXAMPLE: title] content
    const exampleMatch = line.match(/^\[EXAMPLE:\s*(.+?)\]\s*(.*)$/i);
    if (exampleMatch) {
      flushText();
      elements.push(
        <ConceptCard key={key++} type="example" title={exampleMatch[1]} content={exampleMatch[2]} />
      );
      continue;
    }

    // [TIP: title] content
    const tipMatch = line.match(/^\[TIP:\s*(.+?)\]\s*(.*)$/i);
    if (tipMatch) {
      flushText();
      elements.push(
        <ConceptCard key={key++} type="tip" title={tipMatch[1]} content={tipMatch[2]} />
      );
      continue;
    }

    // [WARNING: title] content
    const warningMatch = line.match(/^\[WARNING:\s*(.+?)\]\s*(.*)$/i);
    if (warningMatch) {
      flushText();
      elements.push(
        <ConceptCard key={key++} type="warning" title={warningMatch[1]} content={warningMatch[2]} />
      );
      continue;
    }

    // [STEP N: title] content
    const stepMatch = line.match(/^\[STEP\s*(\d+):\s*(.+?)\]\s*(.*)$/i);
    if (stepMatch) {
      flushText();
      elements.push(
        <ConceptCard 
          key={key++} 
          type="step" 
          title={stepMatch[2]} 
          content={stepMatch[3]} 
          stepNumber={parseInt(stepMatch[1])}
        />
      );
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      flushText();
      elements.push(
        <h3 key={key++} className="text-base font-bold mt-4 mb-2 text-blue-600 dark:text-blue-400 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {line.slice(4)}
        </h3>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      flushText();
      elements.push(
        <h2 key={key++} className="text-lg font-bold mt-5 mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-700 pb-2">
          {line.slice(3)}
        </h2>
      );
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushText();
      const bulletContent = line.slice(2);
      elements.push(
        <li key={key++} className="ml-4 mb-2 flex items-start gap-2">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
          <span dangerouslySetInnerHTML={{ 
            __html: bulletContent
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
          }} />
        </li>
      );
      continue;
    }

    // Numbered lists
    const numberedMatch = line.match(/^(\d+)\.\s(.*)$/);
    if (numberedMatch) {
      flushText();
      elements.push(
        <li key={key++} className="ml-4 mb-2 flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {numberedMatch[1]}
          </span>
          <span className="pt-0.5" dangerouslySetInnerHTML={{ 
            __html: numberedMatch[2]
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/`(.*?)`/g, '<code class="bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
          }} />
        </li>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      flushText();
      continue;
    }

    // Regular text
    currentText += (currentText ? ' ' : '') + line;
  }

  flushText();

  return <div className="text-sm leading-relaxed">{elements}</div>;
};

export default VisualExplanation;
