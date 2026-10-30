import type { Me, Person, Snapshot, TokenInfo, ProjectRef, Tone } from '../../types';
import type { FetchOpts, GitlabClient } from './client';

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const person = (name: string, i: string, tone: Tone): Person => ({ name, initials: i, tone });
const ML = person('Mariana Lopes', 'ML', 'teal');
const RS = person('Rafael Souza', 'RS', 'indigo');
const TA = person('Thiago Almeida', 'TA', 'violet');
const CF = person('Camila Ferreira', 'CF', 'orange');
const JP = person('João Prado', 'JP', 'green');
const GH = person('Gabriel Henrique', 'GH', 'blue');
const L = (name: string, tone: Tone) => ({ name, tone });
const url = (p: string) => `https://gitlab.example.com/equipe/${p}`;

export const MOCK_PROJECTS: ProjectRef[] = [
  { id: 1, name: 'loja-api', group: 'equipe/loja', monitored: true },
  { id: 2, name: 'cadastro-web', group: 'equipe/cadastro', monitored: true },
  { id: 3, name: 'portal-web', group: 'equipe/portal', monitored: true },
  { id: 4, name: 'pagamentos-api', group: 'equipe/pagamentos', monitored: false },
];

export function mockSnapshot(): Snapshot {
  return {
    issues: [
      { key: 'issue:1:1284', iid: 1284, projectId: 1, project: 'loja-api', title: 'Erro ao gerar nota para pedidos fracionados', description: 'Ao fracionar o pedido, o serviço de notas retorna 422 e a nota fica pendente. Acontece só em pedidos com mais de uma entrega.', author: ML, labels: [L('bug', 'red'), L('prioridade::alta', 'orange')], milestone: 'Sprint 42', updatedAt: ago(2), webUrl: url('loja-api/-/issues/1284'), mine: true },
      { key: 'issue:2:1281', iid: 1281, projectId: 2, project: 'cadastro-web', title: 'Adicionar filtro por período na consulta de clientes', description: 'Filtro de período na tela de consulta para a equipe comercial.', author: RS, labels: [L('feature', 'blue')], updatedAt: ago(18), webUrl: url('cadastro-web/-/issues/1281'), mine: true },
      { key: 'issue:3:1277', iid: 1277, projectId: 3, project: 'portal-web', title: 'Timeout na integração com o ERP ao sincronizar pedidos', description: '', author: TA, labels: [L('bug', 'red'), L('backend', 'violet')], updatedAt: ago(60), webUrl: url('portal-web/-/issues/1277'), mine: false },
      { key: 'issue:2:1270', iid: 1270, projectId: 2, project: 'cadastro-web', title: 'Atualizar texto do termo de adesão (LGPD)', description: '', author: CF, labels: [L('docs', 'neutral')], updatedAt: ago(180), webUrl: url('cadastro-web/-/issues/1270'), mine: false },
      { key: 'issue:1:1266', iid: 1266, projectId: 1, project: 'loja-api', title: 'Rota de entrega duplicada no app do motorista', description: '', author: JP, labels: [L('bug', 'red'), L('mobile', 'teal')], updatedAt: ago(1500), webUrl: url('loja-api/-/issues/1266'), mine: true },
    ],
    mrs: [
      { key: 'mr:1:532', iid: 532, projectId: 1, project: 'loja-api', title: 'feat: cálculo de frete por faixa de peso', author: GH, labels: [], updatedAt: ago(12), webUrl: url('loja-api/-/merge_requests/532'), branch: 'feature/frete-faixa-peso → develop', approvals: '0/2', pipe: 'ok' },
      { key: 'mr:2:529', iid: 529, projectId: 2, project: 'cadastro-web', title: 'fix: máscara de CNPJ no cadastro PJ', author: RS, labels: [], updatedAt: ago(40), webUrl: url('cadastro-web/-/merge_requests/529'), branch: 'fix/mascara-cnpj → develop', approvals: '1/2', pipe: 'running' },
      { key: 'mr:3:521', iid: 521, projectId: 3, project: 'portal-web', title: 'refactor: separar serviço de notificações', author: TA, labels: [], updatedAt: ago(120), webUrl: url('portal-web/-/merge_requests/521'), branch: 'refactor/notificacoes → develop', approvals: '1/2', pipe: 'fail' },
    ],
    pipes: [
      { key: 'pipe:3:88412', id: 88412, projectId: 3, project: 'portal-web', name: 'Deploy QA', ref: 'main', status: 'fail', updatedAt: ago(1), durationSec: 252, webUrl: url('portal-web/-/pipelines/88412'), failedJob: { id: 1, name: 'deploy-qa', stage: 'deploy', stageIndex: 3, stageTotal: 4, tail: 'Error: connection refused registry.example.com:5000' } },
      { key: 'pipe:2:88409', id: 88409, projectId: 2, project: 'cadastro-web', name: 'Testes', ref: 'fix/mascara-cnpj', status: 'running', updatedAt: ago(0), durationSec: 123, webUrl: url('cadastro-web/-/pipelines/88409') },
      { key: 'pipe:1:88397', id: 88397, projectId: 1, project: 'loja-api', name: 'Deploy QA', ref: 'develop', status: 'ok', updatedAt: ago(22), durationSec: 228, webUrl: url('loja-api/-/pipelines/88397') },
      { key: 'pipe:2:88390', id: 88390, projectId: 2, project: 'cadastro-web', name: 'Build', ref: 'develop', status: 'ok', updatedAt: ago(35), durationSec: 115, webUrl: url('cadastro-web/-/pipelines/88390') },
    ],
    todos: [
      { key: 'todo:501', id: 501, targetKind: 'issue', iid: 1284, projectId: 1, project: 'loja-api', title: 'Erro ao gerar nota para pedidos fracionados', body: '@voce consegue olhar o payload que foi rejeitado?', action: 'mentioned', targetRef: '#1284', author: ML, updatedAt: ago(5), webUrl: url('loja-api/-/issues/1284#note_9001') },
      { key: 'todo:502', id: 502, targetKind: 'mr', iid: 521, projectId: 3, project: 'portal-web', title: 'refactor: separar serviço de notificações', body: '', action: 'assigned', targetRef: '!521', author: TA, updatedAt: ago(90), webUrl: url('portal-web/-/merge_requests/521') },
    ],
    myMrs: [{ key: 'mr:1:540', title: 'feat: exportar relatório em PDF', project: 'loja-api', webUrl: url('loja-api/-/merge_requests/540'), createdAt: ago(3 * 1440), reviewed: false }],
  };
}

export class MockGitlabClient implements GitlabClient {
  async me(): Promise<Me> {
    return { id: 1, username: 'voce', name: 'Você' };
  }
  async tokenInfo(): Promise<TokenInfo> {
    return { scopes: ['read_api'], expiresAt: '2027-03-12' };
  }
  async searchProjects(q: string): Promise<ProjectRef[]> {
    return MOCK_PROJECTS.filter((p) => p.name.includes(q.toLowerCase()));
  }
  async fetchAll({ projects }: FetchOpts): Promise<Snapshot> {
    const ids = new Set(projects.filter((p) => p.monitored).map((p) => p.id));
    const s = mockSnapshot();
    return { issues: s.issues.filter((i) => ids.has(i.projectId)), mrs: s.mrs.filter((m) => ids.has(m.projectId)), pipes: s.pipes.filter((p) => ids.has(p.projectId)), todos: s.todos, myMrs: s.myMrs };
  }
  async retryJob() {}
  async markTodoDone() {}
  async getIssueState(): Promise<{ state: 'opened' }> {
    return { state: 'opened' };
  }
}
