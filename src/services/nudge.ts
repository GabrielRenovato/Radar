import type { MyMr, Tab, ToastPayload } from '../types';

export const IDLE_MS = 3 * 3600_000;
export const MAX_PER_DAY = 2;
export const SNOOZE_LATER_MS = 2 * 3600_000;
const IGNORED_BEFORE_SLOWING = 3;

export interface NudgeState {
  lastAt: number;
  day: string;
  count: number;
  ignored: number;
  snoozeUntil: number;
}

export const emptyNudge = (): NudgeState => ({ lastAt: 0, day: '', count: 0, ignored: 0, snoozeUntil: 0 });

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const endOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

export const STALE_MR_MS = 24 * 3600_000;

export interface StaleMr {
  title: string;
  project: string;
  days: number;
  url: string;
}

// MR meu, aberto há 24 h+ e sem nenhum review, comentário ou aprovação: o mais antigo vem primeiro.
export function staleMrs(myMrs: MyMr[], now: number): StaleMr[] {
  return myMrs
    .filter((m) => !m.reviewed && now - new Date(m.createdAt).getTime() >= STALE_MR_MS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ title: m.title, project: m.project, days: Math.max(1, Math.floor((now - new Date(m.createdAt).getTime()) / 86400_000)), url: m.webUrl }));
}

export interface NudgeCounts {
  stale: StaleMr[];
  fails: { name: string; project: string }[];
  todos: number;
  mrs: number;
  issues: number;
}

export interface NudgeInput {
  enabled: boolean;
  quiet: boolean;
  now: number;
  lastOpenedAt: number | null;
  nudge: NudgeState;
  counts: NudgeCounts;
}

const pendingTotal = (c: NudgeCounts) => c.fails.length + c.stale.length + c.todos + c.mrs + c.issues;

// Horário comercial fixo (seg–sex, 8h–18h), independente do "Não perturbe", para o bicho não aparecer à noite.
const isWorkHour = (now: number) => {
  const d = new Date(now);
  return d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= 8 && d.getHours() < 18;
};

// Quem ignora 3 lembretes seguidos passa a receber com o dobro de espaçamento, em vez de ser mais cutucado.
export function shouldNudge(i: NudgeInput): boolean {
  if (!i.enabled || i.quiet || !isWorkHour(i.now) || pendingTotal(i.counts) === 0) return false;
  if (i.now < i.nudge.snoozeUntil) return false;
  if (i.lastOpenedAt !== null && i.now - i.lastOpenedAt < IDLE_MS) return false;
  const todayCount = i.nudge.day === dayKey(new Date(i.now)) ? i.nudge.count : 0;
  if (todayCount >= MAX_PER_DAY) return false;
  const gap = IDLE_MS * (i.nudge.ignored >= IGNORED_BEFORE_SLOWING ? 2 : 1);
  return i.now - i.nudge.lastAt >= gap;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function nudgeMessage(c: NudgeCounts): { tab: Tab; sub: string; title?: string; url?: string } {
  if (c.fails.length) {
    const f = c.fails[0];
    return { tab: 'pipes', sub: `Aquele ${f.name} de ${f.project} ainda está vermelho 👀` };
  }
  if (c.stale.length) {
    const s = c.stale[0];
    const more = c.stale.length > 1 ? ` (e mais ${c.stale.length - 1})` : '';
    return { tab: 'mrs', title: 'Seu MR está esperando review', sub: `“${s.title}” em ${s.project} está há ${plural(s.days, 'dia', 'dias')} sem ninguém olhar${more}. Que tal cutucar alguém? 👀`, url: s.url };
  }
  const parts = [c.todos && plural(c.todos, 'menção', 'menções'), c.mrs && plural(c.mrs, 'MR para revisar', 'MRs para revisar'), c.issues && plural(c.issues, 'issue nova', 'issues novas')].filter(Boolean) as string[];
  const tab: Tab = c.todos ? 'todos' : c.mrs ? 'mrs' : 'issues';
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  return { tab, sub: `Tem ${text} esperando você.` };
}

export function nudgePayload(c: NudgeCounts): ToastPayload {
  const { tab, sub, title, url } = nudgeMessage(c);
  return { variant: 'nudge', key: `nudge:${Date.now()}`, title: title ?? 'Ei, já deu uma olhada nas notificações hoje?', sub, foot: 'Radinho · Radar', url: url ?? '', tab };
}
