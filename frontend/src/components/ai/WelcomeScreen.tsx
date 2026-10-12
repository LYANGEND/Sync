import { Sparkles, ArrowRight, Zap } from 'lucide-react';
import type { Persona, QuickCommand, TeacherClass } from './masterAIPersonas';

export const WelcomeScreen = ({ onCommand, schoolName, logoUrl, persona, quickCommands, classPicker }: {
  onCommand: (cmd: string) => void;
  schoolName: string;
  logoUrl?: string;
  persona: Persona;
  quickCommands: QuickCommand[];
  classPicker?: { classes: TeacherClass[]; value: string; onChange: (id: string) => void };
}) => (
  <div className="flex flex-col items-center justify-center min-h-full py-6 md:py-8 px-4 md:px-4">
    {logoUrl ? (
      <img
        src={logoUrl}
        alt={schoolName}
        className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-contain bg-white dark:bg-slate-800 p-2 shadow-sm border border-gray-200 dark:border-slate-700 mb-4 md:mb-6"
      />
    ) : (
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))' }}>
        <Sparkles className="w-8 h-8 md:w-10 md:h-10" />
      </div>
    )}
    <div className="mb-3 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
      {persona.badge(schoolName)}
    </div>
    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center px-2">
      {persona.heading(schoolName)}
    </h3>
    <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm mb-2 text-center max-w-md px-2">
      {persona.intro}
    </p>
    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 md:mb-6 text-center px-2">
      Pick a starter to edit it before sending.
    </p>

    {classPicker && (
      <label className="mb-4 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        Starters for
        <select
          value={classPicker.value}
          onChange={e => classPicker.onChange(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
        >
          {classPicker.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="">Any class</option>
        </select>
      </label>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 w-full max-w-2xl px-2">
      {quickCommands.map((cmd, i) => (
        <button
          key={i}
          onClick={() => onCommand(cmd.command)}
          className="flex items-center gap-2 md:gap-3 p-3 md:p-4 bg-white/95 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 transition-all text-left group shadow-sm hover:-translate-y-0.5"
          style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 10%, rgb(229 231 235))' }}
        >
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)', color: 'var(--primary-color)' }}>
            <cmd.icon size={16} className="md:w-[18px] md:h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">{cmd.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{cmd.command}</p>
          </div>
          <ArrowRight size={12} className="md:w-[14px] md:h-[14px] text-gray-300 dark:text-gray-600 flex-shrink-0 transition-colors" style={{ color: 'var(--primary-color)' }} />
        </button>
      ))}
    </div>

    <div className="mt-6 md:mt-8 rounded-xl p-4 md:p-5 border max-w-lg w-full mx-2 shadow-sm bg-white/85 dark:bg-slate-800/80" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 12%, rgb(226 232 240))' }}>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Zap size={14} className="flex-shrink-0" style={{ color: 'var(--primary-color)' }} />
        <span>{persona.capabilitiesTitle(schoolName)}</span>
      </h4>
      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
        {persona.capabilities.map(item => (
          <li key={item} className="flex items-start gap-2"><span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--primary-color)' }}>•</span><span>{item}</span></li>
        ))}
      </ul>
    </div>
  </div>
);
