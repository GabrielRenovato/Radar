import { useEffect, useRef } from 'react';
import type { ToastPayload } from '../types';
import { Avatar, Icon, IconButton } from '../ui';
import { bridge } from '../lib/env';

const AUTO_CLOSE_MS = 9000;

const closeSelf = () => bridge()?.toastClose();

// O item só é marcado como lido ao abrir; "Dispensar" apenas fecha.
const open = (p: ToastPayload) => bridge()?.toastOpen(p.variant === 'group' ? p.keys : [p.key], p.url);

export function Toast({ payload: p }: { payload: ToastPayload }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.classList.add('toast');
    bridge()?.toastSize(ref.current!.offsetHeight);
    const t = setTimeout(closeSelf, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} className="acrylic box-border flex w-[364px] flex-col gap-2.5 rounded-flyout py-3 pl-4 pr-3 pb-3.5 font-sans text-body text-fg shadow-flyout">
      <div className="flex items-center gap-2">
        <span className="grid h-4 w-4 place-items-center rounded-control bg-accent text-accent-on"><Icon name="radar" size={12} /></span>
        <span className="flex-1 text-meta text-fg-2">Radar</span>
        <IconButton icon="close" title="Fechar" size={24} iconSize={16} onClick={closeSelf} />
      </div>

      <div className="flex items-start gap-3">
        {p.variant === 'simple' && <Avatar person={p.person} size={40} />}
        {p.variant === 'group' && <Circle icon="stacks" cls="bg-accent-tint text-accent-text" />}
        {p.variant === 'fail' && <Circle icon="cancel" cls="bg-danger-tint text-danger" fill />}
        {p.variant === 'ok' && <Circle icon="check_circle" cls="bg-accent-tint text-accent" fill />}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`text-[14px] font-semibold leading-5 [text-wrap:pretty] ${p.variant === 'fail' ? 'text-danger-text' : p.variant === 'ok' ? 'text-accent-text' : ''}`}>{p.title}</span>
          {p.variant === 'group' ? (
            <div className="flex flex-col gap-0.5">
              {p.lines.map((l) => (
                <span key={l.ref} className="flex min-w-0 gap-1.5 text-fg-2"><span className="flex-none text-fg-3">{l.ref}</span><span className="truncate">{l.title}</span></span>
              ))}
            </div>
          ) : (
            <span className="text-fg-2">{p.sub}</span>
          )}
          <span className="text-meta text-fg-3">{p.foot}</span>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2">
        <button onClick={() => void open(p)} className="h-8 rounded-control bg-accent text-body font-semibold text-accent-on hover:bg-accent-hover">Abrir</button>
        <button onClick={closeSelf} className="h-8 rounded-control border border-stroke-2 bg-card hover:bg-card-hover">Dispensar</button>
      </div>
    </div>
  );
}

function Circle({ icon, cls, fill }: { icon: string; cls: string; fill?: boolean }) {
  return <span className={`grid h-10 w-10 flex-none place-items-center rounded-full ${cls}`}><Icon name={icon} size={icon === 'stacks' ? 22 : 24} fill={fill} /></span>;
}
