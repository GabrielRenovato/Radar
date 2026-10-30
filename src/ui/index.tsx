import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Person, Tone } from '../types';

export function Icon({ name, size = 18, fill = false, className = '' }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <span className={`msr ${className}`} style={{ fontSize: size, fontVariationSettings: fill ? "'FILL' 1" : undefined }} aria-hidden>
      {name}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({ icon, size = 32, iconSize = 18, className = '', ...p }: BtnProps & { icon: string; size?: number; iconSize?: number }) {
  return (
    <button
      aria-label={p.title}
      {...p}
      style={{ width: size, height: size }}
      className={`grid place-items-center rounded-control text-fg-2 hover:bg-subtle ${className}`}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

export function Button({ variant = 'secondary', icon, children, className = '', ...p }: BtnProps & { variant?: 'primary' | 'secondary'; icon?: string }) {
  const base = 'flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12.5px]';
  const v = variant === 'primary' ? 'bg-accent font-semibold text-accent-on hover:bg-accent-hover' : 'border border-stroke-2 bg-card text-fg hover:bg-card-hover';
  return (
    <button {...p} className={`${base} ${v} ${className}`}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function Avatar({ person, size = 16 }: { person: Person; size?: number }) {
  return (
    <span
      title={person.name}
      className="grid flex-none place-items-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size >= 32 ? 14 : 8, background: `var(--lb-${person.tone}-bg)`, color: `var(--lb-${person.tone}-fg)` }}
    >
      {person.initials}
    </span>
  );
}

export function Label({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="flex-none rounded-control px-1.5 text-label" style={{ background: `var(--lb-${tone}-bg)`, color: `var(--lb-${tone}-fg)` }}>
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={on ? 'Ativado' : 'Desativado'}
      onClick={() => onChange(!on)}
      className={`flex h-5 w-10 flex-none items-center rounded-full border px-[3px] ${on ? 'justify-end border-accent bg-accent' : 'justify-start border-fg-2 bg-transparent'}`}
    >
      <span className={`h-3 w-3 rounded-full ${on ? 'bg-accent-on' : 'bg-fg-2'}`} />
    </button>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-stroke rounded-card border border-stroke bg-card">{children}</div>;
}

export function EmptyState({ icon, tone, title, text, children }: { icon: string; tone: 'accent' | 'warn'; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-9 pb-6 text-center">
      <div className={`mb-2 grid h-14 w-14 place-items-center rounded-full ${tone === 'accent' ? 'bg-accent-tint text-accent' : 'bg-warn-tint text-warn'}`}>
        <Icon name={icon} size={30} />
      </div>
      <span className="text-subtitle">{title}</span>
      <span className="text-[12.5px] leading-[17px] text-fg-2 [text-wrap:pretty]">{text}</span>
      {children}
    </div>
  );
}

export function FilterChip({ label, active, options, onPick }: { label: string; active: boolean; options: { value: string; label: string }[]; onPick: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [open]);
  const pick = (v: string | null) => { onPick(v); setOpen(false); };
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const item = 'block w-full truncate px-3 py-1.5 text-left text-[12px] hover:bg-subtle';
  return (
    <div ref={ref} className="min-w-0 max-w-full">
      <button
        onClick={() => { setQ(''); setOpen((o) => !o); }}
        title={label}
        className={`flex h-[26px] max-w-full items-center gap-1 rounded-control border pl-2 pr-1.5 text-[12px] ${active ? 'border-accent bg-accent-tint text-accent-text' : 'border-stroke-2 bg-card text-fg'}`}
      >
        <span className="truncate">{label}</span>
        <Icon name="expand_more" size={16} className="flex-none text-fg-3" />
      </button>
      {open && (
        // Ancorado na linha de filtros (pai com position: relative), não no chip: ocupa a largura do popup e nunca passa da borda.
        <div ref={menuRef} className="absolute inset-x-3 top-full z-20 overflow-hidden rounded-card border border-stroke-2 bg-card shadow-flyout">
          {options.length > 5 && (
            <div className="border-b border-stroke p-1.5">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-7 w-full rounded-control border border-stroke-2 bg-input px-2 text-[12px] outline-none focus:border-accent" />
            </div>
          )}
          <div className="rd-scroll max-h-52 overflow-y-auto py-1">
            {!q && <button className={item} onClick={() => pick(null)}>Todos</button>}
            {shown.map((o) => (
              <button key={o.value} title={o.label} className={item} onClick={() => pick(o.value)}>
                {o.label}
              </button>
            ))}
            {shown.length === 0 && <span className="block px-3 py-1.5 text-[12px] text-fg-3">Nada encontrado.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
