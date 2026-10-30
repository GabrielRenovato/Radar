import type { Issue, LabelTag, Me, MergeRequest, MyMr, Person, Pipeline, PipeStatus, ProjectRef, Snapshot, Todo, TokenInfo } from '../../types';
import { initials, toneFor } from '../../lib/time';
import { httpFetch } from '../platform';
import type { IssueState } from '../watch';
import { classifyError, GitlabError, labelTone, type FetchOpts, type GitlabClient } from '../gitlab/client';

const API_VERSION = '7.1';
// connectionData só existe como API em preview; com "7.1" puro o Azure responde 400.
const CONNECTION_DATA_VERSION = '7.1-preview.1';
const CLOSED_STATES = ['Closed', 'Done', 'Removed', 'Resolved', 'Completed'];
const WI_FIELDS = ['System.Id', 'System.Title', 'System.Description', 'System.CreatedBy', 'System.AssignedTo', 'System.Tags', 'System.IterationPath', 'System.ChangedDate', 'System.TeamProject', 'System.State'];

type Json = any;

// O Radar usa ids numéricos; o Azure identifica projetos por nome/GUID, então o id é um hash estável do nome.
export function projectId(name: string): number {
  let h = 0;
  for (const c of name.toLowerCase()) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return Math.abs(h) + 1;
}

const toPerson = (u: Json): Person => {
  const name = u?.displayName ?? u?.uniqueName ?? 'Desconhecido';
  return { name, initials: initials(name), tone: toneFor(name) };
};

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const toTags = (tags = ''): LabelTag[] =>
  tags.split(';').map((t) => t.trim()).filter(Boolean).map((name) => ({ name, tone: labelTone(name) }));

// A iteração vem como "Projeto\Sprint 42"; só o último trecho interessa como milestone.
const sprintOf = (path?: string) => (path && path.includes('\\') ? path.split('\\').pop() : undefined);

const branchOf = (ref = '') => ref.replace(/^refs\/heads\//, '');

export function mapBuildStatus(status: string, result?: string): PipeStatus | null {
  if (status === 'completed') return result === 'succeeded' ? 'ok' : result === 'failed' ? 'fail' : null;
  if (['notStarted', 'inProgress', 'postponed'].includes(status)) return 'running';
  return null;
}

// `host` é a URL da organização: https://dev.azure.com/org ou https://servidor/tfs/Colecao (on-premises).
export class AzureDevOpsClient implements GitlabClient {
  private guid = '';
  private account = '';
  private names = new Map<number, string>();

  constructor(private token: string, private host: string) {
    this.host = host.replace(/\/+$/, '');
  }

  private async raw(path: string, init: { method?: string; body?: unknown; version?: string } = {}): Promise<Response> {
    const url = `${this.host}${path}${path.includes('?') ? '&' : '?'}api-version=${init.version ?? API_VERSION}`;
    let res: Response;
    try {
      res = await httpFetch(url, {
        method: init.method,
        body: init.body ? JSON.stringify(init.body) : undefined,
        headers: { Authorization: `Basic ${btoa(`:${this.token}`)}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (e) {
      throw classifyError(e);
    }
    // PAT inválido pode vir como 203 (página de login) em vez de 401.
    if (res.status === 203) throw new GitlabError('auth', 'Token inválido ou expirado', 401);
    if (!res.ok) {
      const err = classifyError(null, res.status);
      err.message = err.message.replace('GitLab', 'Azure DevOps') + ` (${path.split('?')[0]})`;
      throw err;
    }
    return res;
  }

  private async get<T = Json>(path: string, version?: string): Promise<T> {
    return (await this.raw(path, { version })).json() as Promise<T>;
  }

  async me(): Promise<Me> {
    const d = await this.get<Json>('/_apis/connectionData', CONNECTION_DATA_VERSION);
    const u = d.authenticatedUser ?? {};
    this.guid = u.id ?? '';
    this.account = String(u.properties?.Account?.$value ?? u.providerDisplayName ?? '').toLowerCase();
    return { id: projectId(this.guid), username: this.account, name: u.providerDisplayName ?? this.account };
  }

  async tokenInfo(): Promise<TokenInfo> {
    return { scopes: [], expiresAt: null };
  }

  async searchProjects(q: string): Promise<ProjectRef[]> {
    const d = await this.get<{ value: Json[] }>('/_apis/projects?$top=200');
    const org = this.host.split('/').filter(Boolean).pop() ?? '';
    return d.value
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 20)
      .map((p) => {
        const id = projectId(p.name);
        this.names.set(id, p.name);
        return { id, name: p.name, group: org, monitored: true };
      });
  }

  async knownProjects(): Promise<Set<number>> {
    const d = await this.get<{ value: Json[] }>('/_apis/projects?$top=500');
    return new Set(d.value.map((p) => projectId(p.name)));
  }

  private isMe(u: Json) {
    return !!u && ((!!this.guid && u.id === this.guid) || (!!this.account && String(u.uniqueName ?? '').toLowerCase() === this.account));
  }

  private workItems(ids: number[]) {
    if (!ids.length) return Promise.resolve<Json[]>([]);
    return this.get<{ value: Json[] }>(`/_apis/wit/workitems?ids=${ids.join(',')}&fields=${WI_FIELDS.join(',')}`).then((r) => r.value);
  }

  private async wiql(query: string, project?: string): Promise<number[]> {
    const r = await this.raw(`${project ? `/${encodeURIComponent(project)}` : ''}/_apis/wit/wiql?$top=50`, { method: 'POST', body: { query } });
    const d = (await r.json()) as { workItems?: { id: number }[] };
    return (d.workItems ?? []).map((w) => w.id);
  }

  async fetchAll({ projects, qaEnv }: FetchOpts): Promise<Snapshot> {
    const active = projects.filter((p) => p.monitored);
    for (const p of active) this.names.set(p.id, p.name);
    if (!this.guid) await this.me();
    const notClosed = CLOSED_STATES.map((s) => `'${s}'`).join(',');
    const esc = (s: string) => s.replace(/'/g, "''");

    const issueLists = await Promise.all(
      active.map(async (p) => {
        const ids = await this.wiql(`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${esc(p.name)}' AND [System.State] NOT IN (${notClosed}) ORDER BY [System.ChangedDate] DESC`, p.name);
        return this.workItems(ids);
      }),
    );
    const toIssue = (w: Json): Issue => {
      const f = w.fields;
      const proj = f['System.TeamProject'] as string;
      return {
        key: `issue:${projectId(proj)}:${w.id}`,
        iid: w.id,
        projectId: projectId(proj),
        project: proj,
        title: f['System.Title'],
        description: stripHtml(f['System.Description']),
        author: toPerson(f['System.CreatedBy']),
        labels: toTags(f['System.Tags']),
        milestone: sprintOf(f['System.IterationPath']),
        updatedAt: f['System.ChangedDate'],
        webUrl: `${this.host}/${encodeURIComponent(proj)}/_workitems/edit/${w.id}`,
        mine: this.isMe(f['System.AssignedTo']) || this.isMe(f['System.CreatedBy']),
      };
    };
    const issues = issueLists.flat().map(toIssue);

    const prLists = await Promise.all(
      active.map((p) => this.get<{ value: Json[] }>(`/${encodeURIComponent(p.name)}/_apis/git/pullrequests?searchCriteria.status=active&searchCriteria.reviewerId=${this.guid}&$top=50`).then((r) => r.value).catch(() => [] as Json[])),
    );
    const mrs: MergeRequest[] = [];
    const prRefs = new Map<number, Set<string>>(active.map((p) => [p.id, new Set(['main', 'develop'])]));
    for (const pr of prLists.flat()) {
      const proj = pr.repository.project.name as string;
      const id = projectId(proj);
      prRefs.get(id)?.add(branchOf(pr.sourceRefName));
      const reviewers: Json[] = pr.reviewers ?? [];
      const mine = reviewers.find((r) => r.id === this.guid);
      if (mine && mine.vote >= 5) continue;
      const approved = reviewers.filter((r) => r.vote >= 5).length;
      const required = reviewers.filter((r) => r.isRequired).length || reviewers.length;
      mrs.push({
        key: `mr:${id}:${pr.pullRequestId}`,
        iid: pr.pullRequestId,
        projectId: id,
        project: proj,
        title: pr.title,
        author: toPerson(pr.createdBy),
        labels: (pr.labels ?? []).map((l: Json) => ({ name: l.name, tone: labelTone(l.name) })),
        // O PR não expõe "atualizado em"; a data de criação é o melhor sinal disponível.
        updatedAt: pr.creationDate,
        webUrl: `${this.host}/${encodeURIComponent(proj)}/_git/${encodeURIComponent(pr.repository.name)}/pullrequest/${pr.pullRequestId}`,
        branch: `${branchOf(pr.sourceRefName)} → ${branchOf(pr.targetRefName)}`,
        approvals: `${approved}/${required}`,
        pipe: 'none',
      });
    }

    const mineLists = await Promise.all(
      active.map((p) => this.get<{ value: Json[] }>(`/${encodeURIComponent(p.name)}/_apis/git/pullrequests?searchCriteria.status=active&searchCriteria.creatorId=${this.guid}&$top=50`).then((r) => r.value).catch(() => [] as Json[])),
    );
    // Só alimenta o lembrete do Radinho: "reviewed" = algum reviewer já votou.
    const myMrs: MyMr[] = mineLists.flat().filter((pr) => !pr.isDraft).map((pr) => {
      const proj = pr.repository.project.name as string;
      return {
        key: `mr:${projectId(proj)}:${pr.pullRequestId}`,
        title: pr.title,
        project: proj,
        webUrl: `${this.host}/${encodeURIComponent(proj)}/_git/${encodeURIComponent(pr.repository.name)}/pullrequest/${pr.pullRequestId}`,
        createdAt: pr.creationDate,
        reviewed: (pr.reviewers ?? []).some((r: Json) => r.vote !== 0),
      };
    });

    const pipes: Pipeline[] = [];
    for (const p of active) {
      const refs = [...(prRefs.get(p.id) ?? [])];
      const lists = await Promise.all(
        refs.map((r) => this.get<{ value: Json[] }>(`/${encodeURIComponent(p.name)}/_apis/build/builds?branchName=${encodeURIComponent(`refs/heads/${r}`)}&$top=3&queryOrder=queueTimeDescending`).then((x) => x.value).catch(() => [] as Json[])),
      );
      for (const b of lists.flat()) {
        const status = mapBuildStatus(b.status, b.result);
        if (!status) continue;
        const isQa = new RegExp(`deploy.*${esc(qaEnv)}|deploy.*qa`, 'i').test(b.definition?.name ?? '');
        const start = new Date(b.startTime ?? b.queueTime).getTime();
        const end = new Date(b.finishTime ?? Date.now()).getTime();
        pipes.push({
          key: `pipe:${p.id}:${b.id}`,
          id: b.id,
          projectId: p.id,
          project: p.name,
          name: isQa ? 'Deploy QA' : b.definition?.name ?? 'Pipeline',
          ref: branchOf(b.sourceBranch),
          status,
          updatedAt: b.finishTime ?? b.startTime ?? b.queueTime,
          durationSec: Math.max(0, Math.round((end - start) / 1000)),
          webUrl: b._links?.web?.href ?? `${this.host}/${encodeURIComponent(p.name)}/_build/results?buildId=${b.id}`,
          failedJob: status === 'fail' ? await this.failedJob(p.name, b.id) : undefined,
        });
      }
    }

    // Azure não tem To-Do: o equivalente às atribuições são work items de qualquer projeto atribuídos a você por outra pessoa.
    const todoIds = await this.wiql(`SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.CreatedBy] <> @Me AND [System.State] NOT IN (${notClosed}) ORDER BY [System.ChangedDate] DESC`).catch(() => [] as number[]);
    const todos: Todo[] = (await this.workItems(todoIds).catch(() => [] as Json[])).map((w) => {
      const i = toIssue(w);
      return { key: `todo:${w.id}`, id: w.id, targetKind: 'issue', iid: w.id, projectId: i.projectId, project: i.project, title: i.title, body: '', action: 'assigned', targetRef: `#${w.id}`, author: i.author, updatedAt: i.updatedAt, webUrl: i.webUrl };
    });

    const byUpdated = <T extends { updatedAt: string }>(a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);
    return { issues: issues.sort(byUpdated), mrs: mrs.sort(byUpdated), pipes: pipes.sort(byUpdated), todos: todos.sort(byUpdated), myMrs };
  }

  private async failedJob(project: string, buildId: number): Promise<Pipeline['failedJob']> {
    const t = await this.get<{ records: Json[] }>(`/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/timeline`).catch(() => null);
    const records = t?.records ?? [];
    const failed = records.find((r) => r.type === 'Task' && r.result === 'failed');
    if (!failed) return undefined;
    const stages = records.filter((r) => r.type === 'Stage').sort((a, b) => a.order - b.order);
    const byId = new Map(records.map((r) => [r.id, r]));
    let parent = byId.get(failed.parentId);
    while (parent && parent.type !== 'Stage') parent = byId.get(parent.parentId);
    const msg = (failed.issues ?? []).find((i: Json) => i.type === 'error')?.message ?? '';
    return {
      id: 0,
      name: failed.name,
      stage: parent?.name ?? '',
      stageIndex: parent ? stages.findIndex((s) => s.id === parent!.id) + 1 : 1,
      stageTotal: Math.max(stages.length, 1),
      tail: String(msg).split(/\r?\n/)[0].slice(0, 200),
    };
  }

  async getIssueState(_projectId: number, iid: number): Promise<IssueState> {
    const w = await this.get<Json>(`/_apis/wit/workitems/${iid}`);
    const f = w.fields;
    if (!CLOSED_STATES.includes(f['System.State'])) return { state: 'opened' };
    return { state: 'closed', closedBy: toPerson(f['Microsoft.VSTS.Common.ClosedBy'] ?? f['System.ChangedBy']), closedAt: f['Microsoft.VSTS.Common.ClosedDate'] ?? f['System.ChangedDate'] };
  }

  // Sem equivalente de To-Do para concluir e sem "rodar job de novo" por tarefa: ambos são no-ops.
  async markTodoDone() {}
  async retryJob() {}
}
