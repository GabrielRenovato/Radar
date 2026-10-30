import type { Issue, LabelTag, Me, MergeRequest, MyMr, Person, Pipeline, PipeStatus, ProjectRef, Snapshot, Tone, TokenInfo, Todo, TodoAction } from '../../types';
import { initials, toneFor } from '../../lib/time';
import { httpFetch } from '../platform';
import type { IssueState } from '../watch';

export type GitlabErrorKind = 'network' | 'auth' | 'http';

export class GitlabError extends Error {
  constructor(public kind: GitlabErrorKind, message: string, public status?: number) {
    super(message);
  }
}

export interface FetchOpts {
  projects: ProjectRef[];
  me: Me;
  qaEnv: string;
}

export interface GitlabClient {
  me(): Promise<Me>;
  tokenInfo(): Promise<TokenInfo>;
  searchProjects(q: string): Promise<ProjectRef[]>;
  fetchAll(opts: FetchOpts): Promise<Snapshot>;
  retryJob(projectId: number, jobId: number): Promise<void>;
  markTodoDone(id: number): Promise<void>;
  getIssueState(projectId: number, iid: number): Promise<IssueState>;
  // Ids de projeto que o servidor conhece; o store descarta os demais (ex.: restos de outro sistema ou servidor).
  knownProjects?(): Promise<Set<number>>;
}

// Erros de transporte (DNS, VPN, timeout) viram 'network'; só 401 vira 'auth'.
export function classifyError(err: unknown, status?: number): GitlabError {
  if (err instanceof GitlabError) return err;
  if (status === 401) return new GitlabError('auth', 'Token inválido ou expirado', 401);
  if (status !== undefined) return new GitlabError('http', `GitLab respondeu ${status}`, status);
  return new GitlabError('network', err instanceof Error ? err.message : 'Falha de rede');
}

const LABEL_TONES: [RegExp, Tone][] = [
  [/bug|erro|falha/i, 'red'],
  [/priorid|priority|urgent|cr[ií]tic/i, 'orange'],
  [/feature|melhoria|enhancement/i, 'blue'],
  [/backend|api/i, 'violet'],
  [/mobile|app/i, 'teal'],
  [/doc/i, 'neutral'],
];

export function labelTone(name: string): Tone {
  return LABEL_TONES.find(([re]) => re.test(name))?.[1] ?? 'neutral';
}

const toLabels = (names: string[] = []): LabelTag[] => names.map((name) => ({ name, tone: labelTone(name) }));

const toPerson = (u: { name?: string; username?: string } | undefined): Person => {
  const name = u?.name ?? u?.username ?? 'Desconhecido';
  return { name, initials: initials(name), tone: toneFor(name) };
};

export function mapPipeStatus(s: string): PipeStatus | null {
  if (s === 'success') return 'ok';
  if (s === 'failed') return 'fail';
  if (['running', 'pending', 'created', 'preparing', 'waiting_for_resource', 'scheduled'].includes(s)) return 'running';
  return null;
}

const TODO_ACTIONS: TodoAction[] = ['mentioned', 'directly_addressed', 'assigned', 'marked', 'unmergeable', 'review_submitted'];
const toTodoAction = (a: string): TodoAction => (TODO_ACTIONS as string[]).includes(a) ? (a as TodoAction) : 'other';

const ANSI =/\u001b\[[0-9;]*[A-Za-z]/g;

type Json = any;

export class RealGitlabClient implements GitlabClient {
  constructor(private token: string, private host: string) {}

  private async raw(path: string, init: { method?: string } = {}): Promise<Response> {
    let res: Response;
    try {
      res = await httpFetch(`${this.host}/api/v4${path}`, { ...init, headers: { 'PRIVATE-TOKEN': this.token } });
    } catch (e) {
      throw classifyError(e);
    }
    if (!res.ok) {
      const err = classifyError(null, res.status);
      err.message += ` (${path.split('?')[0]})`;
      throw err;
    }
    return res;
  }

  private async get<T = Json>(path: string): Promise<T> {
    return (await this.raw(path)).json() as Promise<T>;
  }

  me() {
    return this.get<Me>('/user');
  }

  async tokenInfo(): Promise<TokenInfo> {
    const t = await this.get<{ scopes: string[]; expires_at: string | null }>('/personal_access_tokens/self');
    return { scopes: t.scopes, expiresAt: t.expires_at };
  }

  async searchProjects(q: string): Promise<ProjectRef[]> {
    const list = await this.get<Json[]>(`/projects?membership=true&simple=true&per_page=20&search=${encodeURIComponent(q)}`);
    return list.map((p) => ({ id: p.id, name: p.path, group: p.namespace?.full_path ?? p.path_with_namespace, monitored: true }));
  }

  async fetchAll({ projects, me, qaEnv }: FetchOpts): Promise<Snapshot> {
    const active = projects.filter((p) => p.monitored);
    const byId = new Map(active.map((p) => [p.id, p]));

    const issueLists = await Promise.all(
      active.map((p) => this.get<Json[]>(`/projects/${p.id}/issues?state=opened&order_by=updated_at&per_page=50`)),
    );
    const issues: Issue[] = issueLists.flat().map((i) => ({
      key: `issue:${i.project_id}:${i.iid}`,
      iid: i.iid,
      projectId: i.project_id,
      project: byId.get(i.project_id)?.name ?? String(i.project_id),
      title: i.title,
      description: i.description ?? '',
      author: toPerson(i.author),
      labels: toLabels(i.labels),
      milestone: i.milestone?.title,
      updatedAt: i.updated_at,
      webUrl: i.web_url,
      mine: (i.assignees ?? []).some((a: Json) => a.id === me.id) || i.author?.id === me.id,
    }));

    const mrRaw: Json[] = await this.get(`/merge_requests?reviewer_username=${encodeURIComponent(me.username)}&state=opened&scope=all&per_page=50`);
    const mrs: MergeRequest[] = [];
    for (const m of mrRaw.filter((x) => byId.has(x.project_id))) {
      const ap = await this.get<Json>(`/projects/${m.project_id}/merge_requests/${m.iid}/approvals`).catch(() => null);
      if (ap?.approved_by?.some((a: Json) => a.user?.id === me.id)) continue;
      mrs.push({
        key: `mr:${m.project_id}:${m.iid}`,
        iid: m.iid,
        projectId: m.project_id,
        project: byId.get(m.project_id)!.name,
        title: m.title,
        author: toPerson(m.author),
        labels: toLabels(m.labels),
        milestone: m.milestone?.title,
        updatedAt: m.updated_at,
        webUrl: m.web_url,
        branch: `${m.source_branch} → ${m.target_branch}`,
        approvals: `${ap?.approved_by?.length ?? 0}/${(ap?.approvals_required ?? 0) || (ap?.approved_by?.length ?? 0)}`,
        pipe: mapPipeStatus(m.head_pipeline?.status ?? '') ?? 'none',
      });
    }

    // Só alimenta o lembrete do Radinho: "reviewed" = alguém comentou ou deu aprovação.
    const mineRaw = await this.get<Json[]>(`/merge_requests?author_id=${me.id}&state=opened&scope=all&per_page=50`).catch(() => [] as Json[]);
    const myMrs: MyMr[] = mineRaw
      .filter((x) => byId.has(x.project_id) && !x.draft && !x.work_in_progress)
      .map((x) => ({ key: `mr:${x.project_id}:${x.iid}`, title: x.title, project: byId.get(x.project_id)!.name, webUrl: x.web_url, createdAt: x.created_at, reviewed: (x.user_notes_count ?? 0) > 0 || (x.upvotes ?? 0) > 0 }));

    const refsByProject = new Map<number, Set<string>>();
    for (const p of active) refsByProject.set(p.id, new Set(['main', 'develop']));
    for (const m of mrRaw) refsByProject.get(m.project_id)?.add(m.source_branch);

    const pipes: Pipeline[] = [];
    for (const p of active) {
      const refs = [...(refsByProject.get(p.id) ?? [])];
      const lists = await Promise.all(refs.map((r) => this.get<Json[]>(`/projects/${p.id}/pipelines?ref=${encodeURIComponent(r)}&per_page=3&order_by=id&sort=desc`).catch(() => [])));
      for (const pl of lists.flat()) {
        const status = mapPipeStatus(pl.status);
        if (!status) continue;
        const jobs = await this.get<Json[]>(`/projects/${p.id}/pipelines/${pl.id}/jobs?per_page=50`).catch(() => []);
        const isQa = jobs.some((j) => j.environment?.name === qaEnv || /deploy.*qa/i.test(j.name));
        const stages = [...new Set(jobs.map((j) => j.stage as string))];
        const failed = jobs.find((j) => j.status === 'failed');
        let failedJob: Pipeline['failedJob'];
        if (status === 'fail' && failed) {
          const trace = await this.raw(`/projects/${p.id}/jobs/${failed.id}/trace`).then((r) => r.text()).catch(() => '');
          const tail = trace.replace(ANSI, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? '';
          failedJob = { id: failed.id, name: failed.name, stage: failed.stage, stageIndex: stages.indexOf(failed.stage) + 1, stageTotal: stages.length, tail: tail.slice(0, 200) };
        }
        pipes.push({
          key: `pipe:${p.id}:${pl.id}`,
          id: pl.id,
          projectId: p.id,
          project: p.name,
          name: isQa ? 'Deploy QA' : 'Pipeline',
          ref: pl.ref,
          status,
          updatedAt: pl.updated_at,
          durationSec: Math.max(0, Math.round((new Date(pl.updated_at).getTime() - new Date(pl.created_at).getTime()) / 1000)),
          webUrl: pl.web_url,
          failedJob,
        });
      }
    }

    // To-Dos cobrem menções e atribuições em qualquer projeto; falha de pipeline e pedido de review já têm abas próprias.
    const todoRaw = await this.get<Json[]>('/todos?state=pending&per_page=50').catch((e) => {
      if (e instanceof GitlabError && e.kind === 'auth') throw e;
      return [] as Json[];
    });
    const todos: Todo[] = todoRaw
      .filter((d) => d.action_name !== 'build_failed' && d.action_name !== 'review_requested')
      .map((d) => ({
        key: `todo:${d.id}`,
        id: d.id,
        targetKind: d.target_type === 'Issue' ? 'issue' : d.target_type === 'MergeRequest' ? 'mr' : 'other',
        iid: d.target?.iid ?? 0,
        projectId: d.project?.id ?? 0,
        project: d.project?.path ?? d.project?.name ?? '',
        title: d.target?.title ?? d.body ?? '',
        body: d.body ?? '',
        action: toTodoAction(d.action_name),
        targetRef: d.target_type === 'MergeRequest' ? `!${d.target?.iid ?? ''}` : `#${d.target?.iid ?? ''}`,
        author: toPerson(d.author),
        updatedAt: d.created_at,
        webUrl: d.target_url,
      }));

    const byUpdated = <T extends { updatedAt: string }>(a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);
    return { issues: issues.sort(byUpdated), mrs: mrs.sort(byUpdated), pipes: pipes.sort(byUpdated), todos: todos.sort(byUpdated), myMrs };
  }

  async getIssueState(projectId: number, iid: number): Promise<IssueState> {
    const i = await this.get<Json>(`/projects/${projectId}/issues/${iid}`);
    return { state: i.state === 'closed' ? 'closed' : 'opened', closedBy: i.closed_by ? toPerson(i.closed_by) : undefined, closedAt: i.closed_at ?? undefined };
  }

  async markTodoDone(id: number) {
    await this.raw(`/todos/${id}/mark_as_done`, { method: 'POST' });
  }

  async retryJob(projectId: number, jobId: number) {
    await this.raw(`/projects/${projectId}/jobs/${jobId}/retry`, { method: 'POST' });
  }
}
