import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Conn, Me, ProjectRef, RadarEvent, Snapshot, Tab, TokenInfo } from '../types';
import { resolveClosed, syncWatch } from './watch';
import { detect, emptyTracking, isNew, retryDelaySec, type Tracking } from './detect';
import { GitlabError, type GitlabClient } from './gitlab/client';
import { MockGitlabClient, MOCK_PROJECTS } from './gitlab/mock';
import { createClient, hostnameOf, isValidHost, type ProviderKind } from './providers';
import { notify, toHistory, type HistoryItem } from './notifications';
import { allowHost, secrets, setAutostart, showToast, stateStorage } from './platform';
import { dayKey, emptyNudge, nudgePayload, shouldNudge, staleMrs, type NudgeCounts, type NudgeState } from './nudge';
import { isDndActive, type DndConfig } from '../lib/dnd';
import { isNative } from '../lib/env';

export interface Filters {
  project: number | null;
  label: string | null;
  milestone?: string | null;
  mine: boolean;
}

export interface Prefs {
  interval: 1 | 2 | 5 | 10 | 15;
  dnd: DndConfig;
  ai: boolean;
  aiEndpoint: string;
  autostart: boolean;
  qaEnv: string;
  nudge: boolean;
  provider: ProviderKind;
  host: string;
}

interface State {
  prefs: Prefs;
  projects: ProjectRef[];
  tracking: Tracking;
  filters: Record<Tab, Filters>;
  pausedUntil: number;
  lastOkAt: number | null;

  snap: Snapshot;
  conn: Conn;
  hasToken: boolean;
  demo: boolean;
  me: Me | null;
  tokenInfo: TokenInfo | null;
  tokenTail: string;
  tokenError: string | null;
  lastError: string | null;
  loading: boolean;
  nextCheckAt: number | null;
  tab: Tab;
  view: 'main' | 'settings' | 'history';
  expanded: string | null;
  undoMute: { id: number; name: string } | null;
  history: HistoryItem[];
  lastOpenedAt: number | null;
  nudge: NudgeState;

  markOpened: () => void;
  snoozeNudge: (ms: number) => void;
  maybeNudge: (force?: boolean) => void;
  setTab: (t: Tab) => void;
  setView: (v: 'main' | 'settings' | 'history') => void;
  clearHistory: () => void;
  dismissTodos: (todos: { key: string; id: number }[]) => Promise<void>;
  setExpanded: (key: string | null) => void;
  setFilter: (tab: Tab, patch: Partial<Filters>) => void;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  setProjectMonitored: (id: number, on: boolean) => void;
  addProject: (p: ProjectRef) => void;
  muteProject: (id: number) => void;
  undoMuteProject: () => void;
  markRead: (items: { key: string; updatedAt: string }[]) => void;
  pauseFor: (ms: number) => void;
  saveToken: (token: string, conn?: { provider: ProviderKind; host: string }) => Promise<boolean>;
  retryJob: (projectId: number, jobId: number) => Promise<void>;
  refresh: () => Promise<void>;
  boot: () => Promise<void>;
}

export const DEFAULT_PREFS: Prefs = {
  interval: 2,
  dnd: { on: true, start: '19:00', end: '08:00', days: [1, 2, 3, 4, 5] },
  ai: true,
  aiEndpoint: '',
  autostart: true,
  qaEnv: 'qa',
  nudge: true,
  provider: 'gitlab',
  host: '',
};

const HISTORY_MAX = 50;

const EMPTY_FILTERS: Filters = { project: null, label: null, mine: false };

let client: GitlabClient | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

export const useRadar = create<State>()(
  persist(
    (set, get) => {
      const schedule = (sec: number) => {
        clearTimeout(timer);
        set({ nextCheckAt: Date.now() + sec * 1000 });
        timer = setTimeout(() => void get().refresh(), sec * 1000);
      };

      return {
        prefs: DEFAULT_PREFS,
        projects: [],
        tracking: emptyTracking(),
        filters: { issues: EMPTY_FILTERS, mrs: EMPTY_FILTERS, pipes: EMPTY_FILTERS, todos: EMPTY_FILTERS },
        pausedUntil: 0,
        lastOkAt: null,

        snap: { issues: [], mrs: [], pipes: [], todos: [] },
        conn: 'online',
        hasToken: false,
        demo: false,
        me: null,
        tokenInfo: null,
        tokenTail: '',
        tokenError: null,
        lastError: null,
        loading: false,
        nextCheckAt: null,
        tab: 'issues',
        view: 'main',
        expanded: null,
        undoMute: null,
        history: [],
        lastOpenedAt: null,
        nudge: emptyNudge(),

        markOpened: () => set((s) => ({ lastOpenedAt: Date.now(), nudge: { ...s.nudge, ignored: 0 } })),

        snoozeNudge: (ms) => set((s) => ({ nudge: { ...s.nudge, snoozeUntil: Date.now() + ms } })),

        // `force` é o botão de teste: ignora horário, ociosidade e limites e usa um texto de exemplo se não houver pendência.
        maybeNudge: (force = false) => {
          const s = get();
          const now = Date.now();
          const counts: NudgeCounts = {
            stale: staleMrs(s.snap.myMrs ?? [], now),
            fails: failedPipes(s).map((p) => ({ name: p.name, project: p.project })),
            todos: unreadTodos(s),
            mrs: s.snap.mrs.filter((m) => s.tracking.read[m.key] !== m.updatedAt).length,
            issues: s.snap.issues.filter((i) => isNew(s.tracking, i.key, i.updatedAt)).length,
          };
          if (force) {
            const empty = !counts.fails.length && !counts.stale.length && !counts.todos && !counts.mrs && !counts.issues;
            void showToast(nudgePayload(empty ? { stale: [], fails: [], todos: 2, mrs: 1, issues: 0 } : counts));
            return;
          }
          const quiet = isDndActive(s.prefs.dnd) || s.pausedUntil > now;
          if (!shouldNudge({ enabled: s.prefs.nudge, quiet, now, lastOpenedAt: s.lastOpenedAt, nudge: s.nudge, counts })) return;
          const today = dayKey(new Date(now));
          set({ nudge: { ...s.nudge, lastAt: now, day: today, count: (s.nudge.day === today ? s.nudge.count : 0) + 1, ignored: s.nudge.ignored + 1 } });
          void showToast(nudgePayload(counts));
        },

        clearHistory: () => set({ history: [] }),

        // Esconde localmente; com escopo `api` também conclui o To-Do no GitLab (read_api sozinho não pode alterar).
        dismissTodos: async (todos) => {
          set((s) => ({ tracking: { ...s.tracking, dismissed: { ...s.tracking.dismissed, ...Object.fromEntries(todos.map((d) => [d.key, true as const])) } } }));
          if (!get().tokenInfo?.scopes.includes('api')) return;
          await Promise.all(todos.map((d) => client?.markTodoDone(d.id).catch(() => {})));
        },
        setTab: (tab) => set({ tab, expanded: null }),
        setView: (view) => set({ view }),
        setExpanded: (key) => set((s) => ({ expanded: s.expanded === key ? null : key })),
        setFilter: (tab, patch) => set((s) => ({ filters: { ...s.filters, [tab]: { ...s.filters[tab], ...patch } } })),

        setPref: (k, v) => {
          set((s) => ({ prefs: { ...s.prefs, [k]: v } }));
          if (k === 'autostart') void setAutostart(v as boolean);
          if (k === 'interval') void get().refresh();
        },

        setProjectMonitored: (id, on) => {
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, monitored: on } : p)) }));
          void get().refresh();
        },

        addProject: (p) => {
          if (get().projects.some((x) => x.id === p.id)) return;
          set((s) => ({ projects: [...s.projects, { ...p, monitored: true }] }));
          void get().refresh();
        },

        muteProject: (id) => {
          const p = get().projects.find((x) => x.id === id);
          if (!p) return;
          get().setProjectMonitored(id, false);
          clearTimeout(undoTimer);
          set({ undoMute: { id, name: p.name } });
          undoTimer = setTimeout(() => set({ undoMute: null }), 5000);
        },

        undoMuteProject: () => {
          const u = get().undoMute;
          if (!u) return;
          clearTimeout(undoTimer);
          set({ undoMute: null });
          get().setProjectMonitored(u.id, true);
        },

        markRead: (items) =>
          set((s) => {
            const read = { ...s.tracking.read };
            for (const i of items) read[i.key] = i.updatedAt;
            return { tracking: { ...s.tracking, read } };
          }),

        pauseFor: (ms) => set({ pausedUntil: Date.now() + ms }),

        // Trocar de sistema ou de servidor invalida ids de projeto, chaves de rastreio e histórico: tudo recomeça do zero.
        saveToken: async (token, conn) => {
          const { provider, host } = conn ?? get().prefs;
          if (!isValidHost(host)) {
            set({ tokenError: 'Informe o endereço do servidor, começando com http:// ou https://' });
            return false;
          }
          const probe = createClient(provider, host.trim().replace(/\/+$/, ''), token);
          try {
            await allowHost(hostnameOf(host));
            const me = await probe.me();
            const info = await probe.tokenInfo().catch(() => ({ scopes: [], expiresAt: null }));
            await secrets.set(token);
            client = probe;
            failures = 0;
            const prev = get().prefs;
            const changed = prev.provider !== provider || prev.host !== host;
            set((s) => ({
              prefs: { ...s.prefs, provider, host: host.trim().replace(/\/+$/, '') },
              ...(changed ? { projects: [], tracking: emptyTracking(), snap: { issues: [], mrs: [], pipes: [], todos: [] }, history: [], filters: { issues: EMPTY_FILTERS, mrs: EMPTY_FILTERS, pipes: EMPTY_FILTERS, todos: EMPTY_FILTERS } } : {}),
              me, tokenInfo: info, hasToken: true, tokenTail: token.slice(-4), tokenError: null, conn: 'online',
            }));
            void get().refresh();
            return true;
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            set({ tokenError: e instanceof GitlabError && e.kind === 'auth' ? `Token inválido ou expirado · HTTP 401 ${detail}` : `Não foi possível validar o token: ${detail}` });
            return false;
          }
        },

        retryJob: async (projectId, jobId) => {
          await client?.retryJob(projectId, jobId);
          await get().refresh();
        },

        refresh: async () => {
          const s = get();
          if (s.loading || !client) return;
          set({ loading: true });
          try {
            const me = s.me ?? (await client.me());
            let projects = s.projects;
            const known = await client.knownProjects?.();
            if (known?.size) projects = projects.filter((p) => known.has(p.id));
            if (projects.length === 0 && s.demo) projects = MOCK_PROJECTS;
            if (projects.length === 0) projects = await client.searchProjects('');
            const snap = await client.fetchAll({ projects, me, qaEnv: s.prefs.qaEnv });
            const detected = detect(snap, get().tracking);
            const { watch, closed } = await resolveClosed(syncWatch(detected.tracking.watch ?? {}, snap), snap, (p, i) => client!.getIssueState(p, i));
            const tracking = { ...detected.tracking, watch };
            const events: RadarEvent[] = [...detected.events, ...closed.map((item) => ({ kind: 'issue-closed' as const, item }))];
            failures = 0;
            set((cur) => ({ snap, me, projects, tracking, conn: 'online', lastError: null, lastOkAt: Date.now(), loading: false, history: [...toHistory(events, Date.now()), ...cur.history].slice(0, HISTORY_MAX) }));
            const quiet = isDndActive(get().prefs.dnd) || get().pausedUntil > Date.now();
            if (events.length && !quiet) void notify(events);
            else get().maybeNudge();
            schedule(get().prefs.interval * 60);
          } catch (e) {
            const err = e instanceof GitlabError ? e : new GitlabError('network', String(e));
            if (err.kind === 'auth') {
              clearTimeout(timer);
              set({ conn: 'token_invalido', loading: false, nextCheckAt: null, tokenError: err.message });
            } else {
              const delay = retryDelaySec(failures++);
              set({ conn: 'sem_vpn', loading: false, lastError: err.message });
              schedule(delay);
            }
          }
        },

        boot: async () => {
          const demo = !isNative();
          const token = demo ? null : await secrets.get();
          set({ demo, hasToken: demo || !!token });
          if (get().lastOpenedAt === null) set({ lastOpenedAt: Date.now() });
          if (demo) {
            client = new MockGitlabClient();
            set({ tokenInfo: await client.tokenInfo(), tokenTail: '3fA9' });
          } else if (token) {
            const { provider, host } = get().prefs;
            if (!isValidHost(host)) {
              set({ conn: 'token_invalido', tokenError: 'Informe o endereço do servidor em Configurações.' });
              return;
            }
            await allowHost(hostnameOf(host));
            client = createClient(provider, host, token);
            set({ tokenTail: token.slice(-4) });
          } else {
            set({ conn: 'token_invalido' });
            return;
          }
          await get().refresh();
        },
      };
    },
    {
      name: 'radar',
      storage: createJSONStorage(() => stateStorage),
      partialize: (s) => ({ prefs: s.prefs, projects: s.projects, tracking: s.tracking, filters: s.filters, pausedUntil: s.pausedUntil, lastOkAt: s.lastOkAt, history: s.history, lastOpenedAt: s.lastOpenedAt, nudge: s.nudge }),
      merge: (saved, cur) => {
        const p = (saved ?? {}) as Partial<State>;
        return { ...cur, ...p, prefs: { ...cur.prefs, ...(p.prefs ?? {}) }, filters: { ...cur.filters, ...(p.filters ?? {}) } };
      },
    },
  ),
);

export const selectNew = (s: State) => {
  const t = s.tracking;
  return {
    issues: s.snap.issues.filter((i) => isNew(t, i.key, i.updatedAt)),
    mrs: s.snap.mrs.filter((m) => isNew(t, m.key, m.updatedAt)),
  };
};

// Contador da bandeja: issues novas + MRs aguardando review + pipelines com falha + menções/atribuições não dispensadas.
export function trayCount(s: State): number {
  const t = s.tracking;
  const issues = s.snap.issues.filter((i) => isNew(t, i.key, i.updatedAt)).length;
  const mrs = s.snap.mrs.filter((m) => t.read[m.key] !== m.updatedAt).length;
  const fails = s.snap.pipes.filter((p) => p.status === 'fail' && t.read[p.key] !== p.updatedAt).length;
  return issues + mrs + fails + unreadTodos(s);
}

export const visibleTodos = (s: State) => s.snap.todos.filter((d) => !s.tracking.dismissed?.[d.key]);

export const unreadTodos = (s: State) => visibleTodos(s).filter((d) => s.tracking.read[d.key] !== d.updatedAt).length;

export const failedPipes = (s: State) => s.snap.pipes.filter((p) => p.status === 'fail' && s.tracking.read[p.key] !== p.updatedAt);
