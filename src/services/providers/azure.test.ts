import { beforeEach, describe, expect, it, vi } from 'vitest';

const routes: Record<string, unknown> = {};
vi.mock('../platform', () => ({
  httpFetch: vi.fn(async (url: string) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) return new Response('{}', { status: 404 });
    const body = routes[hit];
    return body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 });
  }),
}));

import { AzureDevOpsClient, mapBuildStatus, projectId } from './azure';

const HOST = 'https://dev.azure.com/org';
const person = (name: string, uniqueName: string, id = 'other') => ({ displayName: name, uniqueName, id });

beforeEach(() => {
  for (const k of Object.keys(routes)) delete routes[k];
  routes['connectionData'] = { authenticatedUser: { id: 'guid-me', providerDisplayName: 'Gabriel', properties: { Account: { $value: 'Gabriel@x.com' } } } };
});

describe('azure', () => {
  it('gera ids numéricos estáveis por nome de projeto', () => {
    expect(projectId('Logistica')).toBe(projectId('logistica'));
    expect(projectId('A')).not.toBe(projectId('B'));
  });

  it('mapeia status de build', () => {
    expect(mapBuildStatus('completed', 'succeeded')).toBe('ok');
    expect(mapBuildStatus('completed', 'failed')).toBe('fail');
    expect(mapBuildStatus('completed', 'canceled')).toBeNull();
    expect(mapBuildStatus('inProgress')).toBe('running');
  });

  it('identifica o usuário pelo connectionData', async () => {
    const c = new AzureDevOpsClient('pat', HOST);
    expect((await c.me()).username).toBe('gabriel@x.com');
  });

  it('chama connectionData com a versão preview da API', async () => {
    const { httpFetch } = await import('../platform');
    await new AzureDevOpsClient('pat', HOST).me();
    expect(vi.mocked(httpFetch).mock.calls.at(-1)![0]).toContain('connectionData?api-version=7.1-preview.1');
  });

  it('conhece só os projetos da organização', async () => {
    routes['/_apis/projects'] = { value: [{ name: 'Projeto Exemplo' }] };
    const known = await new AzureDevOpsClient('pat', HOST).knownProjects();
    expect(known.has(projectId('Projeto Exemplo'))).toBe(true);
    expect(known.has(projectId('projeto-antigo'))).toBe(false);
  });

  it('PAT inválido (203) vira erro de autenticação', async () => {
    routes['connectionData'] = new Response('<html>', { status: 203 });
    await expect(new AzureDevOpsClient('pat', HOST).me()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('monta issues, MRs e pipelines no formato neutro', async () => {
    routes['/wiql'] = { workItems: [{ id: 7 }] };
    routes['/_apis/wit/workitems'] = {
      value: [{ id: 7, fields: { 'System.Title': 'Bug', 'System.Description': '<p>Olá&nbsp;mundo</p>', 'System.CreatedBy': person('Ana', 'ana@x.com'), 'System.AssignedTo': person('Gabriel', 'gabriel@x.com', 'guid-me'), 'System.Tags': 'bug; urgente', 'System.IterationPath': 'Proj\\Sprint 42', 'System.ChangedDate': '2026-10-29T10:00:00Z', 'System.TeamProject': 'Proj', 'System.State': 'Active' } }],
    };
    routes['/pullrequests'] = {
      value: [
        { pullRequestId: 5, title: 'PR aberto', createdBy: person('Ana', 'ana@x.com'), creationDate: '2026-10-29T09:00:00Z', sourceRefName: 'refs/heads/feat', targetRefName: 'refs/heads/main', repository: { name: 'repo', project: { name: 'Proj' } }, reviewers: [{ id: 'guid-me', vote: 0, isRequired: true }] },
        { pullRequestId: 6, title: 'PR já aprovado', createdBy: person('Ana', 'ana@x.com'), creationDate: '2026-10-29T09:00:00Z', sourceRefName: 'refs/heads/x', targetRefName: 'refs/heads/main', repository: { name: 'repo', project: { name: 'Proj' } }, reviewers: [{ id: 'guid-me', vote: 10 }] },
      ],
    };
    routes['/builds'] = { value: [] };
    const c = new AzureDevOpsClient('pat', HOST);
    const meInfo = await c.me();
    const snap = await c.fetchAll({ projects: [{ id: projectId('Proj'), name: 'Proj', group: 'org', monitored: true }], me: meInfo, qaEnv: 'qa' });

    expect(snap.issues).toHaveLength(1);
    expect(snap.issues[0]).toMatchObject({ iid: 7, title: 'Bug', description: 'Olá mundo', milestone: 'Sprint 42', mine: true, webUrl: `${HOST}/Proj/_workitems/edit/7` });
    expect(snap.issues[0].labels.map((l) => l.name)).toEqual(['bug', 'urgente']);
    expect(snap.mrs.map((m) => m.iid)).toEqual([5]);
    expect(snap.mrs[0].branch).toBe('feat → main');
    expect(snap.myMrs?.map((m) => [m.key.split(':')[2], m.reviewed])).toEqual([['5', false], ['6', true]]);
    expect(snap.todos.map((t) => [t.iid, t.action])).toEqual([[7, 'assigned']]);
  });

  it('issue fechada informa quem fechou', async () => {
    routes['/_apis/wit/workitems/7'] = { fields: { 'System.State': 'Closed', 'System.ChangedBy': person('Rafael', 'r@x.com'), 'System.ChangedDate': '2026-10-29T11:00:00Z' } };
    const s = await new AzureDevOpsClient('pat', HOST).getIssueState(1, 7);
    expect(s.state).toBe('closed');
    expect(s.closedBy?.name).toBe('Rafael');
  });
});

