import type { PipeStatus, RadarEvent, Snapshot } from '../types';
import type { WatchMap } from './watch';

export interface Tracking {
  initialized: boolean;
  seen: Record<string, true>;
  fresh: Record<string, true>;
  read: Record<string, string>;
  lastPipe: Record<string, PipeStatus>;
  // Estado salvo por versões sem To-Do já tem initialized=true; sem esta flag, todos os to-dos pendentes virariam toast na primeira busca.
  todosInit?: boolean;
  dismissed?: Record<string, true>;
  watch?: WatchMap;
}

export const emptyTracking = (): Tracking => ({ initialized: false, seen: {}, fresh: {}, read: {}, lastPipe: {} });

export const isNew = (t: Tracking, key: string, updatedAt: string) => !!t.fresh[key] && t.read[key] !== updatedAt;

const BACKOFF_SEC = [30, 60, 120];
export const retryDelaySec = (attempt: number) => (attempt < BACKOFF_SEC.length ? BACKOFF_SEC[attempt] : 300);

// Primeira execução só grava a base; depois, tudo que não estava no snapshot vira "novo" e gera evento.
// Item já lido que muda de updated_at volta a ser novo, mas sem toast.
export function detect(snap: Snapshot, prev: Tracking): { tracking: Tracking; events: RadarEvent[] } {
  const t: Tracking = { ...prev, seen: { ...prev.seen }, fresh: { ...prev.fresh }, lastPipe: { ...prev.lastPipe } };
  const events: RadarEvent[] = [];
  const known = t.initialized;

  const touch = (key: string, updatedAt: string, isKnown = known): boolean => {
    const unseen = !t.seen[key];
    t.seen[key] = true;
    if (!isKnown) return false;
    if (unseen) {
      t.fresh[key] = true;
      return true;
    }
    if (t.read[key] && t.read[key] !== updatedAt) t.fresh[key] = true;
    return false;
  };

  for (const i of snap.issues) if (touch(i.key, i.updatedAt)) events.push({ kind: 'issue', item: i });
  for (const m of snap.mrs) if (touch(m.key, m.updatedAt)) events.push({ kind: 'mr', item: m });

  const oldestFirst = [...snap.pipes].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const p of oldestFirst) {
    const fresh = touch(p.key, p.updatedAt);
    const refKey = `${p.projectId}:${p.ref}`;
    const before = t.lastPipe[refKey];
    if (fresh && p.status === 'fail') events.push({ kind: 'pipe-fail', item: p });
    if (fresh && p.status === 'ok' && before === 'fail' && p.name === 'Deploy QA') events.push({ kind: 'pipe-ok', item: p });
    if (p.status !== 'running') t.lastPipe[refKey] = p.status;
  }

  for (const d of snap.todos) if (touch(d.key, d.updatedAt, !!t.todosInit) && known) events.push({ kind: 'todo', item: d });

  t.initialized = true;
  t.todosInit = true;
  return { tracking: t, events };
}
