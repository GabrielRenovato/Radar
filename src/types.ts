export type Tone = 'red' | 'orange' | 'blue' | 'violet' | 'teal' | 'indigo' | 'neutral' | 'green';
export type Tab = 'issues' | 'mrs' | 'pipes' | 'todos';
export type PipeStatus = 'ok' | 'fail' | 'running';
export type Conn = 'online' | 'sem_vpn' | 'token_invalido';

export interface Person {
  name: string;
  initials: string;
  tone: Tone;
}

export interface LabelTag {
  name: string;
  tone: Tone;
}

export interface Issue {
  key: string;
  iid: number;
  projectId: number;
  project: string;
  title: string;
  description: string;
  author: Person;
  labels: LabelTag[];
  milestone?: string;
  updatedAt: string;
  webUrl: string;
  mine: boolean;
}

export interface MergeRequest {
  key: string;
  iid: number;
  projectId: number;
  project: string;
  title: string;
  author: Person;
  labels: LabelTag[];
  milestone?: string;
  updatedAt: string;
  webUrl: string;
  branch: string;
  approvals: string;
  pipe: PipeStatus | 'none';
}

export interface FailedJob {
  name: string;
  stage: string;
  stageIndex: number;
  stageTotal: number;
  tail: string;
  id: number;
}

export interface Pipeline {
  key: string;
  id: number;
  projectId: number;
  project: string;
  name: string;
  ref: string;
  status: PipeStatus;
  updatedAt: string;
  durationSec: number;
  webUrl: string;
  failedJob?: FailedJob;
}

export type TodoAction = 'mentioned' | 'directly_addressed' | 'assigned' | 'marked' | 'unmergeable' | 'review_submitted' | 'other';

export interface ClosedIssue {
  key: string;
  iid: number;
  projectId: number;
  project: string;
  title: string;
  webUrl: string;
  closedBy: Person;
  closedAt: string;
}

export interface Todo {
  key: string;
  id: number;
  targetKind: 'issue' | 'mr' | 'other';
  iid: number;
  projectId: number;
  project: string;
  title: string;
  body: string;
  action: TodoAction;
  targetRef: string;
  author: Person;
  updatedAt: string;
  webUrl: string;
}

// MR/PR aberto por mim; alimenta só o lembrete do Radinho, não tem aba própria.
export interface MyMr {
  key: string;
  title: string;
  project: string;
  webUrl: string;
  createdAt: string;
  reviewed: boolean;
}

export interface Snapshot {
  issues: Issue[];
  mrs: MergeRequest[];
  pipes: Pipeline[];
  todos: Todo[];
  myMrs?: MyMr[];
}

export interface ProjectRef {
  id: number;
  name: string;
  group: string;
  monitored: boolean;
}

export interface TokenInfo {
  scopes: string[];
  expiresAt: string | null;
}

export interface Me {
  id: number;
  username: string;
  name: string;
}

export type RadarEvent =
  | { kind: 'issue'; item: Issue }
  | { kind: 'mr'; item: MergeRequest }
  | { kind: 'pipe-fail'; item: Pipeline }
  | { kind: 'pipe-ok'; item: Pipeline }
  | { kind: 'todo'; item: Todo }
  | { kind: 'issue-closed'; item: ClosedIssue };

export type ToastPayload =
  | { variant: 'simple'; key: string; title: string; sub: string; foot: string; person: Person; url: string }
  | { variant: 'group'; key: string; title: string; lines: { ref: string; title: string }[]; foot: string; keys: string[]; url: string }
  | { variant: 'fail' | 'ok'; key: string; title: string; sub: string; foot: string; url: string }
  | { variant: 'nudge'; key: string; title: string; sub: string; foot: string; url: string; tab: Tab };
