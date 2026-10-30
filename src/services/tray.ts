import { useRadar, trayCount, failedPipes, unreadTodos } from './store';
import { bridge } from '../lib/env';
import { relativeTime } from '../lib/time';

type Badge = { text: string; color: string } | null;

function draw(size: number, fg: string, dim: boolean, badge: Badge): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const k = size / 32;
  g.globalAlpha = dim ? 0.45 : 1;
  g.strokeStyle = g.fillStyle = fg;
  g.lineCap = 'round';
  // Com badge, o radar encolhe para o canto inferior esquerdo e o número domina o ícone (16 px é pequeno).
  const cx = (badge ? 13 : 16) * k;
  const cy = (badge ? 19 : 16) * k;
  const s = badge ? 0.8 : 1;
  g.lineWidth = 3 * k * s;
  for (const r of [13, 8]) {
    g.beginPath();
    g.arc(cx, cy, r * k * s, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, 3 * k * s, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + 9 * k * s, cy - 9 * k * s);
  g.stroke();
  g.globalAlpha = 1;
  if (badge) {
    const wide = badge.text.length > 2;
    const r = (wide ? 13 : 12) * k;
    const bx = size - r;
    const by = r;
    g.fillStyle = badge.color;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2 * k;
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `800 ${(wide ? 13 : badge.text.length > 1 ? 17 : 20) * k}px "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(badge.text, bx, by + k);
  }
  return g.getImageData(0, 0, size, size);
}

// Prioridade do badge: laranja "!" (sem VPN/token) > vermelho (falha) > verde (pendências) > nenhum.
function describe() {
  const s = useRadar.getState();
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (s.conn !== 'online') {
    return { dim: true, badge: { text: '!', color: '#c0650f' }, tip: s.conn === 'sem_vpn' ? 'Radar · sem conexão com o servidor' : 'Radar · token inválido ou expirado' };
  }
  const count = trayCount(s);
  const fails = failedPipes(s);
  if (count === 0) return { dim: false, badge: null, tip: 'Radar · tudo em dia' };
  const text = count > 99 ? '99+' : String(count);
  if (fails.length) {
    const f = fails[0];
    return { dim: false, badge: { text, color: dark ? '#d1453b' : '#c8372d' }, tip: `Radar · ${f.name} falhou em ${f.project} (${relativeTime(f.updatedAt)})` };
  }
  const issues = s.snap.issues.filter((i) => s.tracking.fresh[i.key] && s.tracking.read[i.key] !== i.updatedAt).length;
  const mrs = s.snap.mrs.filter((m) => s.tracking.read[m.key] !== m.updatedAt).length;
  const todos = unreadTodos(s);
  const parts = [issues && `${issues} ${issues === 1 ? 'issue' : 'issues'}`, mrs && `${mrs} ${mrs === 1 ? 'MR' : 'MRs'} para review`, todos && `${todos} ${todos === 1 ? 'menção' : 'menções'}`].filter(Boolean);
  return { dim: false, badge: { text, color: '#2e7d32' }, tip: `Radar · ${parts.join(', ')}` };
}

export function initTray() {
  const b = bridge()!;
  let last = '';
  const push = () => {
    const d = describe();
    const key = `${d.tip}|${d.badge?.text}|${d.dim}`;
    if (key === last) return;
    last = key;
    const fg = window.matchMedia('(prefers-color-scheme: dark)').matches ? '#ffffff' : '#16211a';
    const img = draw(32, fg, d.dim, d.badge);
    b.updateTray({ rgba: new Uint8Array(img.data.buffer), size: 32, tooltip: d.tip });
  };
  push();
  useRadar.subscribe(push);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    last = '';
    push();
  });
  b.on('menu:pause', () => useRadar.getState().pauseFor(3600_000));
  b.on('menu:settings', () => useRadar.getState().setView('settings'));
}
