import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Sheet({ title, onClose, children, wide = false, variant = 'system', eyebrow = 'JOYPAD / SYSTEM', artwork }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; variant?: 'system' | 'cinema'; eyebrow?: string; artwork?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current; const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => { node?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    const remote = (e: Event) => {
      const command = (e as CustomEvent<string>).detail;
      if (command === 'back' || command === 'home') { onClose(); return; }
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select') ?? []);
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (command === 'select') {
        const active = document.activeElement;
        if (active instanceof HTMLSelectElement) {
          active.selectedIndex = (active.selectedIndex + 1) % active.options.length;
          active.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (active instanceof HTMLElement) active.click();
        return;
      }
      const direction = command === 'left' || command === 'up' ? -1 : 1;
      items[(current + direction + items.length) % items.length]?.focus();
    };
    window.addEventListener('joypad-dialog-command', remote);
    return () => window.removeEventListener('joypad-dialog-command', remote);
  }, [onClose]);
  return <dialog ref={ref} className={`os-sheet ${wide ? 'os-sheet-wide' : ''} ${variant === 'cinema' ? 'cine-sheet' : ''}`} aria-label={title} onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    {artwork && <div className="cine-sheet-art" aria-hidden="true"><img src={artwork} alt="" /><span /></div>}
    <div className="os-sheet-content"><header><div><span className="os-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="os-icon" onClick={onClose} aria-label="Zamknij"><X size={20} /></button></header>{children}</div>
  </dialog>;
}
