import { useEffect, useRef, useState } from 'react';
import type { ToastPayload } from '../types';
import { bridge } from '../lib/env';
import { Icon, IconButton } from '../ui';

const STAY_MS = 25000;

type Nudge = Extract<ToastPayload, { variant: 'nudge' }>;

// Mascote flutuante inspirado em uma aplicação da dev Karolyne Martins Rodrigues de Lima; o personagem é próprio do Radar.
// Radinho: gota de gelatina verde com olhos, bochechas e um feixe de radar girando em volta.
export function Radinho({ size = 104 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="radinho-float overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="rg-body" cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#e6fff1" />
          <stop offset=".45" stopColor="#8df0b4" />
          <stop offset="1" stopColor="#1fae6b" />
        </radialGradient>
        <filter id="rg-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <ellipse cx="60" cy="112" rx="26" ry="4.5" fill="#39d98a" opacity=".35" className="radinho-shadow" />
      <circle cx="60" cy="58" r="44" fill="#39d98a" opacity=".45" filter="url(#rg-glow)" />
      <g className="radinho-sweep" style={{ transformOrigin: '60px 58px' }}>
        <path d="M60 58 L60 10 A48 48 0 0 1 94 24 Z" fill="#7dffb8" opacity=".22" />
      </g>
      <path d="M60 18c20 0 36 12 36 38 0 22-14 36-36 36S24 78 24 56c0-26 16-38 36-38z" fill="url(#rg-body)" stroke="#d9ffe9" strokeWidth="1.5" strokeOpacity=".7" />
      <path d="M40 30c6-6 14-8 22-7" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
      <g className="radinho-blink" style={{ transformOrigin: '60px 56px' }}>
        <ellipse cx="47" cy="56" rx="6.2" ry="7.2" fill="#16211a" />
        <ellipse cx="73" cy="56" rx="6.2" ry="7.2" fill="#16211a" />
        <circle cx="49" cy="53.5" r="2.3" fill="#fff" />
        <circle cx="75" cy="53.5" r="2.3" fill="#fff" />
      </g>
      <ellipse cx="38" cy="68" rx="5.5" ry="3.4" fill="#ff8fb0" opacity=".55" />
      <ellipse cx="82" cy="68" rx="5.5" ry="3.4" fill="#ff8fb0" opacity=".55" />
      <path d="M52 69c3 4 13 4 16 0" fill="none" stroke="#16211a" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="98" cy="22" r="2.2" fill="#d9ffe9" className="radinho-spark" />
      <circle cx="16" cy="40" r="1.8" fill="#d9ffe9" className="radinho-spark" style={{ animationDelay: '.8s' }} />
    </svg>
  );
}

export function Mascot({ payload: p }: { payload: Nudge }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const act = (a: 'view' | 'later' | 'stop') => () => void bridge()?.toastAction(a, p.tab, p.url);
  const bye = () => {
    setLeaving(true);
    setTimeout(() => bridge()?.toastClose(), 250);
  };

  useEffect(() => {
    document.body.classList.add('toast');
    bridge()?.toastSize(ref.current!.offsetHeight);
    const t = setTimeout(bye, STAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} className={`flex w-[300px] flex-col items-center font-sans text-body text-fg transition-opacity duration-200 ${leaving ? 'opacity-0' : 'radinho-in'}`}>
      <div className="acrylic relative flex w-full flex-col gap-2 rounded-flyout px-3.5 py-3 shadow-flyout">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-5 [text-wrap:pretty]">{p.title}</span>
          <IconButton icon="close" title="Fechar" size={24} iconSize={16} className="-mr-1 -mt-0.5" onClick={bye} />
        </div>
        <span className="text-fg-2 [text-wrap:pretty]">{p.sub}</span>
        <div className="mt-0.5 grid grid-cols-2 gap-2">
          <button onClick={act('view')} className="flex h-8 items-center justify-center gap-1 rounded-control bg-accent text-body font-semibold text-accent-on hover:bg-accent-hover">
            <Icon name="visibility" size={16} />
            Ver agora
          </button>
          <button onClick={act('later')} className="h-8 rounded-control border border-stroke-2 bg-card hover:bg-card-hover">Mais tarde</button>
        </div>
        <button onClick={act('stop')} className="h-6 rounded-control text-meta text-fg-3 hover:bg-subtle">Já vi, para por hoje</button>
        <span className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-stroke-2 bg-[var(--rd-layer)]" />
      </div>
      <div className="-mb-1 mt-1.5"><Radinho /></div>
    </div>
  );
}
