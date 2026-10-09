import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { Check, Filter, RotateCcw, X } from 'lucide-react';

interface AcademicFilterButtonProps {
    onClick: () => void;
    activeCount?: number;
    label?: string;
    className?: string;
    disabled?: boolean;
}

interface AcademicFilterDialogProps {
    open: boolean;
    title: string;
    description: string;
    children: ReactNode;
    onClose: () => void;
    onApply: (event: React.FormEvent<HTMLFormElement>) => void;
    onReset?: () => void;
    applyLabel?: string;
    applying?: boolean;
    applyDisabled?: boolean;
}

export const AcademicFilterButton = ({
    onClick,
    activeCount = 0,
    label = 'Filter',
    className = '',
    disabled = false,
}: AcademicFilterButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-haspopup="dialog"
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${activeCount > 0
            ? 'border-[#1E40AF] bg-blue-50 text-[#1E40AF] hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/70'
            : 'border-slate-300 bg-white text-slate-700 hover:border-[#1E40AF] hover:bg-surface-hover-accent hover:text-[#1E40AF] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
        } ${className}`}
    >
        <Filter size={18} aria-hidden="true" />
        <span>{label}</span>
        {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1E40AF] px-1.5 text-[10px] leading-none text-white dark:bg-blue-500">
                {activeCount}
            </span>
        )}
    </button>
);

export const AcademicFilterDialog = ({
    open,
    title,
    description,
    children,
    onClose,
    onApply,
    onReset,
    applyLabel = 'Apply Filters',
    applying = false,
    applyDisabled = false,
}: AcademicFilterDialogProps) => {
    const titleId = useId();
    const descriptionId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;

        const getFocusableElements = () => Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ) || []
        );

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab') return;
            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        requestAnimationFrame(() => {
            const preferredElement = dialogRef.current?.querySelector<HTMLElement>('[data-filter-autofocus="true"]');
            (preferredElement || getFocusableElements()[0])?.focus();
        });

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            if (previouslyFocused && previouslyFocused.ownerDocument.contains(previouslyFocused)) {
                previouslyFocused.focus();
            }
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1E40AF] dark:text-blue-300">View options</p>
                        <h2 id={titleId} className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
                        <p id={descriptionId} className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-surface-hover hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:text-slate-400 dark:hover:text-white"
                        aria-label="Close filters"
                    >
                        <X size={19} aria-hidden="true" />
                    </button>
                </div>

                <form onSubmit={onApply}>
                    <div className="space-y-5 p-5 sm:p-6">{children}</div>
                    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            {onReset && (
                                <button
                                    type="button"
                                    onClick={onReset}
                                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-surface-hover hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:text-slate-300 dark:hover:text-white sm:w-auto"
                                >
                                    <RotateCcw size={16} aria-hidden="true" /> Reset
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={onClose}
                                className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={applying || applyDisabled}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900"
                            >
                                {applying ? (
                                    <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" aria-hidden="true" />
                                ) : (
                                    <Check size={17} aria-hidden="true" />
                                )}
                                {applying ? 'Applying…' : applyLabel}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
