import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function Modal({ title, onClose, children, footer, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-x)');
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus({ preventScroll: true }); };
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <header>
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn modal-x" onClick={onClose} aria-label="閉じる"><Icon name="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
