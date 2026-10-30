import type { ClosedIssue, Person, Snapshot } from '../types';

export interface Watched {
  projectId: number;
  iid: number;
  project: string;
  title: string;
  webUrl: string;
  // Só avisa fechamento de quem já foi visto aberto; evita toast retroativo de issue que já estava fechada.
  seenOpen: boolean;
  // Lápide: depois de resolvida, a issue não volta a ser vigiada mesmo com To-Do ainda pendente.
  closed?: boolean;
}

export type WatchMap = Record<string, Watched>;

export interface IssueState {
  state: 'opened' | 'closed';
  closedBy?: Person;
  closedAt?: string;
}

const MAX_CHECKS = 25;
const MENTION_ACTIONS = ['mentioned', 'directly_addressed', 'assigned'];

// Vigia as issues atribuídas a mim ou criadas por mim (flag `mine`) e as que me mencionaram via To-Do.
export function syncWatch(prev: WatchMap, snap: Snapshot): WatchMap {
  const next: WatchMap = { ...prev };
  const open = new Set(snap.issues.map((i) => i.key));

  for (const i of snap.issues) {
    if (i.mine && !next[i.key]?.closed) next[i.key] = { projectId: i.projectId, iid: i.iid, project: i.project, title: i.title, webUrl: i.webUrl, seenOpen: true };
  }
  for (const d of snap.todos) {
    if (d.targetKind !== 'issue' || !MENTION_ACTIONS.includes(d.action)) continue;
    const key = `issue:${d.projectId}:${d.iid}`;
    if (next[key]) continue;
    next[key] = { projectId: d.projectId, iid: d.iid, project: d.project, title: d.title, webUrl: d.webUrl.split('#')[0], seenOpen: open.has(key) };
  }
  for (const key of Object.keys(next)) {
    if (open.has(key) && !next[key].closed) next[key] = { ...next[key], seenOpen: true };
  }
  return next;
}

// Vigiadas que não estão mais na lista de abertas são consultadas uma a uma; falha de rede só adia a checagem.
export async function resolveClosed(
  watch: WatchMap,
  snap: Snapshot,
  getState: (projectId: number, iid: number) => Promise<IssueState>,
): Promise<{ watch: WatchMap; closed: ClosedIssue[] }> {
  const open = new Set(snap.issues.map((i) => i.key));
  const next: WatchMap = { ...watch };
  const closed: ClosedIssue[] = [];
  const pending = Object.entries(next).filter(([key, w]) => !w.closed && !open.has(key)).slice(0, MAX_CHECKS);

  await Promise.all(
    pending.map(async ([key, w]) => {
      const st = await getState(w.projectId, w.iid).catch(() => null);
      if (!st) return;
      if (st.state === 'opened') {
        next[key] = { ...w, seenOpen: true };
        return;
      }
      next[key] = { ...w, closed: true };
      if (w.seenOpen) {
        closed.push({
          key,
          iid: w.iid,
          projectId: w.projectId,
          project: w.project,
          title: w.title,
          webUrl: w.webUrl,
          closedBy: st.closedBy ?? { name: 'Alguém', initials: '?', tone: 'neutral' },
          closedAt: st.closedAt ?? new Date().toISOString(),
        });
      }
    }),
  );
  return { watch: next, closed };
}
