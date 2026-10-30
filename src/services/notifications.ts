import type { RadarEvent, ToastPayload, TodoAction } from '../types';
import { relativeTime, formatDuration } from '../lib/time';
import { showToast } from './platform';

const GROUP_MIN = 3;

export const TODO_LABEL: Record<TodoAction, string> = {
  mentioned: 'Mencionou você',
  directly_addressed: 'Falou com você',
  assigned: 'Atribuiu a você',
  marked: 'Pendência sua',
  unmergeable: 'MR com conflito',
  review_submitted: 'Review enviado',
  other: 'Pendência',
};

// 3+ issues do mesmo projeto no mesmo ciclo (<60 s de janela) viram um único toast agrupado.
export function buildToasts(events: RadarEvent[]): ToastPayload[] {
  const out: ToastPayload[] = [];
  const byProject = new Map<number, Extract<RadarEvent, { kind: 'issue' }>[]>();
  for (const e of events) if (e.kind === 'issue') byProject.set(e.item.projectId, [...(byProject.get(e.item.projectId) ?? []), e]);
  const grouped = new Set<string>();

  for (const list of byProject.values()) {
    if (list.length < GROUP_MIN) continue;
    list.forEach((e) => grouped.add(e.item.key));
    const names = [...new Set(list.map((e) => e.item.author.name))];
    const rest = names.length - 2;
    out.push({
      variant: 'group',
      key: list[0].item.key,
      title: `${list.length} novas issues em ${list[0].item.project}`,
      lines: list.slice(0, 3).map((e) => ({ ref: `#${e.item.iid}`, title: e.item.title })),
      foot: `${names.slice(0, 2).join(', ')}${rest > 0 ? ` e mais ${rest}` : ''} · há ${relativeTime(list[0].item.updatedAt)}`,
      keys: list.map((e) => e.item.key),
      url: list[0].item.webUrl.replace(/\/-\/issues\/\d+$/, '/-/issues'),
    });
  }

  for (const e of events) {
    if (e.kind === 'issue' && !grouped.has(e.item.key)) {
      out.push({ variant: 'simple', key: e.item.key, title: e.item.title, sub: `#${e.item.iid} · ${e.item.project}`, foot: `${e.item.author.name} · há ${relativeTime(e.item.updatedAt)}`, person: e.item.author, url: e.item.webUrl });
    } else if (e.kind === 'mr') {
      out.push({ variant: 'simple', key: e.item.key, title: e.item.title, sub: `!${e.item.iid} · ${e.item.project}`, foot: `${e.item.author.name} · review solicitado`, person: e.item.author, url: e.item.webUrl });
    } else if (e.kind === 'issue-closed') {
      out.push({ variant: 'simple', key: e.item.key, title: e.item.title, sub: `#${e.item.iid} fechada · ${e.item.project}`, foot: `${e.item.closedBy.name} fechou · há ${relativeTime(e.item.closedAt)}`, person: e.item.closedBy, url: e.item.webUrl });
    } else if (e.kind === 'todo') {
      out.push({ variant: 'simple', key: e.item.key, title: e.item.title, sub: `${TODO_LABEL[e.item.action]} · ${e.item.project}`, foot: `${e.item.author.name} · há ${relativeTime(e.item.updatedAt)}`, person: e.item.author, url: e.item.webUrl });
    } else if (e.kind === 'pipe-fail') {
      const j = e.item.failedJob;
      out.push({ variant: 'fail', key: e.item.key, title: `${e.item.name} falhou`, sub: `${e.item.project} · ${e.item.ref} · #${e.item.id}`, foot: `${j ? `Job ${j.name}, etapa ${j.stageIndex} de ${j.stageTotal}` : 'Pipeline'} · há ${relativeTime(e.item.updatedAt)}`, url: e.item.webUrl });
    } else if (e.kind === 'pipe-ok') {
      out.push({ variant: 'ok', key: e.item.key, title: `${e.item.name} passou`, sub: `${e.item.project} · ${e.item.ref} · #${e.item.id}`, foot: `Duração ${formatDuration(e.item.durationSec)} · há ${relativeTime(e.item.updatedAt)}`, url: e.item.webUrl });
    }
  }
  return out;
}

export interface HistoryItem {
  key: string;
  variant: ToastPayload['variant'];
  title: string;
  sub: string;
  foot: string;
  url: string;
  at: number;
}

export function toHistory(events: RadarEvent[], at: number): HistoryItem[] {
  return buildToasts(events).map((t) => ({
    key: t.key,
    variant: t.variant,
    title: t.title,
    sub: t.variant === 'group' ? t.lines.map((l) => `${l.ref} ${l.title}`).join(' · ') : t.sub,
    foot: t.foot,
    url: t.url,
    at,
  }));
}

export async function notify(events: RadarEvent[]) {
  const toasts = buildToasts(events).slice(0, 3);
  for (const t of toasts) await showToast(t);
}
