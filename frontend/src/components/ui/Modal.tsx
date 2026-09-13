import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './DesignSystem';

/** Native dialog supplies inert background, focus containment and nested-modal behavior. */
export default function Modal({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    // Cancel/close is a safe initial focus for confirmations, not the destructive action.
    dialog.querySelector<HTMLElement>('[data-modal-close]')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return <dialog ref={ref} className="ds-modal" aria-labelledby={`${id}-title`}
    aria-describedby={description ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); closeRef.current(); }}>
    <header className="ds-modal-header">
      <div className="min-w-0"><h2 id={`${id}-title`}>{title}</h2>
        {description && <p id={`${id}-description`} className="ds-helper mt-2">{description}</p>}
      </div>
      <Button variant="ghost" data-modal-close aria-label="Close dialog" onClick={onClose}><X size={20} aria-hidden="true" /></Button>
    </header>
    {children && <div className="ds-modal-body">{children}</div>}
    {footer && <footer className="ds-modal-footer">{footer}</footer>}
  </dialog>;
}