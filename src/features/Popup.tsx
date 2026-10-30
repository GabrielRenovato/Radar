import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tab } from '../types';
import { useRadar } from '../services/store';
import { isNew } from '../services/detect';
import { hostnameOf, PROVIDERS } from '../services/providers';
import { hidePopup, openExternal } from '../services/platform';
import { hhmm } from '../lib/time';
import { EmptyState, FilterChip, Icon, IconButton, Button } from '../ui';
import { IssueCard, MrCard, PipeCard, TodoCard } from './cards';
import { Settings } from './Settings';
import { History } from './History';

const LIMIT = 50;
const TABS: [Tab, string][] = [['issues', 'Issues'], ['mrs', 'MRs'], ['pipes', 'Pipelines'], ['todos', 'Menções']];
const EMPTY_TEXT: Record<Tab, (n: number, min: number) => string> = {
  issues: (n, min) => `Nenhuma issue nova nos ${n} projetos monitorados. Próxima verificação em ${min} min.`,
  mrs: () => 'Nenhum merge request aguardando seu review.',
  pipes: () => 'Nenhuma pipeline com falha nas últimas 24 h.',
  todos: () => 'Ninguém mencionou ou atribuiu nada a você.',
};

function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Popup() {
  const s = useRadar();
  const now = useNow();
  const listRef = useRef<HTMLDivElement>(null);
  const { tab, snap, tracking, filters, conn } = s;
  const f = filters[tab];
  const offline = conn === 'sem_vpn';
  const needsToken = conn === 'token_invalido';
  const monitored = s.projects.filter((p) => p.monitored);

  const issues = useMemo(() => {
    const t = tracking;
    return snap.issues
      .filter((i) => (!f.project || i.projectId === f.project) && (!f.label || i.labels.some((l) => l.name === f.label)) && (!f.milestone || i.milestone === f.milestone) && (!f.mine || i.mine))
      .sort((a, b) => Number(isNew(t, b.key, b.updatedAt)) - Number(isNew(t, a.key, a.updatedAt)) || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, LIMIT);
  }, [snap.issues, tracking, f]);
  const mrs = useMemo(() => snap.mrs.filter((m) => (!f.project || m.projectId === f.project) && (!f.milestone || m.milestone === f.milestone)).slice(0, LIMIT), [snap.mrs, f.project, f.milestone]);
  const pipes = useMemo(() => snap.pipes.filter((p) => !f.project || p.projectId === f.project).slice(0, LIMIT), [snap.pipes, f.project]);
  const todos = useMemo(() => snap.todos.filter((d) => !tracking.dismissed?.[d.key] && (!f.project || d.projectId === f.project)).slice(0, LIMIT), [snap.todos, tracking.dismissed, f.project]);
  const fails = pipes.filter((p) => p.status === 'fail').length;
  const counts: Record<Tab, number> = { issues: issues.length, mrs: mrs.length, pipes: fails, todos: todos.length };
  const visibleCount = { issues: issues.length, mrs: mrs.length, pipes: pipes.length, todos: todos.length }[tab];
  const allLabels = [...new Set(snap.issues.flatMap((i) => i.labels.map((l) => l.name)))].sort();
  const allMilestones = [...new Set((tab === 'issues' ? snap.issues : snap.mrs).map((x) => x.milestone).filter((m): m is string => !!m))].sort();

  const markAll = () => {
    const items = { issues, mrs, pipes, todos }[tab];
    s.markRead(items.map((i) => ({ key: i.key, updatedAt: i.updatedAt })));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (s.view !== 'main') s.setView('main');
        else if (s.expanded) s.setExpanded(s.expanded);
        else void hidePopup();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const cards = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
      if (!cards.length) return;
      e.preventDefault();
      const i = cards.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? Math.min(cards.length - 1, i + 1) : Math.max(0, i - 1);
      cards[next].focus();
      cards[next].scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.view, s.expanded]);

  if (s.view === 'settings') return <Shell><Settings /></Shell>;
  if (s.view === 'history') return <Shell><History /></Shell>;

  const sys = PROVIDERS[s.prefs.provider];
  const minLeft = s.nextCheckAt ? Math.max(1, Math.ceil((s.nextCheckAt - now) / 60000)) : s.prefs.interval;
  const secLeft = s.nextCheckAt ? Math.max(0, Math.round((s.nextCheckAt - now) / 1000)) : 30;
  const statusText = needsToken ? 'Token não configurado' : offline ? `Sem conexão · última verificação ${s.lastOkAt ? hhmm(s.lastOkAt) : '–'}` : `Atualizado às ${s.lastOkAt ? hhmm(s.lastOkAt) : '--:--'}`;
  const footer = needsToken ? '' : offline ? `Nova tentativa em ${secLeft} s` : `Próxima verificação em ${minLeft} min`;

  return (
    <Shell>
      <div className="flex items-center gap-2.5 py-3 pl-3.5 pr-2 pb-2">
        <div className="grid h-7 w-7 flex-none place-items-center rounded-card bg-accent text-accent-on"><Icon name="radar" size={18} /></div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-header">Radar</span>
          <span className="flex items-center gap-1.5 text-meta text-fg-3">
            <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: offline || needsToken ? 'var(--rd-warn)' : 'var(--rd-accent)' }} />
            <span className="truncate">{statusText}</span>
          </span>
        </div>
        <IconButton icon="refresh" title="Atualizar agora" onClick={() => void s.refresh()} className={s.loading ? 'animate-spin' : ''} />
        <IconButton icon="done_all" title="Marcar todas como lidas" onClick={markAll} />
        <IconButton icon="history" title="Notificações recentes" onClick={() => s.setView('history')} />
        <IconButton icon="settings" title="Configurações" onClick={() => s.setView('settings')} />
      </div>

      <div role="tablist" className="flex gap-0.5 border-b border-stroke px-2">
        {TABS.map(([k, label]) => {
          const active = tab === k;
          const danger = k === 'pipes' && fails > 0;
          return (
            <button key={k} role="tab" aria-selected={active} onClick={() => s.setTab(k)} className={`relative flex h-9 items-center gap-1.5 rounded-t-control px-2 text-body hover:bg-subtle ${active ? 'font-semibold text-fg' : 'text-fg-2'}`}>
              {label}
              <span className={`h-4 min-w-[18px] rounded-lg px-[5px] text-center text-[11px] font-semibold leading-4 ${danger ? 'bg-danger text-white' : 'bg-subtle text-fg-2'}`}>{offline || needsToken ? '–' : counts[k]}</span>
              <span className={`absolute bottom-0 left-1/2 -ml-2 h-[3px] w-4 rounded-sm ${active ? 'bg-accent' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-1.5 px-3 pb-1.5 pt-2">
        <div className="max-w-[210px] min-w-0">
          <FilterChip
            label={f.project ? `Projeto: ${monitored.find((p) => p.id === f.project)?.name ?? ''}` : 'Projeto: Todos'}
            active={!!f.project}
            options={monitored.map((p) => ({ value: String(p.id), label: p.name }))}
            onPick={(v) => s.setFilter(tab, { project: v ? Number(v) : null })}
          />
        </div>
        {tab === 'todos' && todos.length > 0 && (
          <button onClick={() => void s.dismissTodos(todos)} className="ml-auto flex h-[26px] flex-none items-center gap-1 whitespace-nowrap rounded-control border border-stroke-2 bg-card px-2 text-[12px] hover:bg-subtle">
            <Icon name="delete_sweep" size={15} />
            Limpar menções
          </button>
        )}
        {(tab === 'issues' || tab === 'mrs') && (
          <div className="max-w-[150px] min-w-0">
            <FilterChip label={f.milestone ? `Milestone: ${f.milestone}` : 'Milestone'} active={!!f.milestone} options={allMilestones.map((m) => ({ value: m, label: m }))} onPick={(v) => s.setFilter(tab, { milestone: v })} />
          </div>
        )}
        {tab === 'issues' && (
          <>
            <div className="max-w-[130px] min-w-0">
              <FilterChip label={f.label ?? 'Label'} active={!!f.label} options={allLabels.map((l) => ({ value: l, label: l }))} onPick={(v) => s.setFilter(tab, { label: v })} />
            </div>
            <button onClick={() => s.setFilter(tab, { mine: !f.mine })} className={`flex h-[26px] flex-none items-center gap-1 whitespace-nowrap rounded-control border px-2 text-[12px] ${f.mine ? 'border-accent bg-accent-tint text-accent-text' : 'border-stroke-2 bg-card text-fg'}`}>
              <Icon name={f.mine ? 'check' : 'person'} size={15} />
              Atribuídas a mim
            </button>
          </>
        )}
      </div>

      <div ref={listRef} className="rd-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-0.5">
        {needsToken ? (
          <EmptyState icon="key_off" tone="warn" title={s.hasToken ? 'Token inválido ou expirado' : `Conecte ao ${sys.label}`} text={s.tokenError ?? 'Informe o servidor e um token de acesso pessoal de leitura para começar a receber avisos.'}>
            <Button className="mt-2.5 h-[30px] px-3" icon="settings" onClick={() => s.setView('settings')}>Abrir configurações</Button>
          </EmptyState>
        ) : offline && !snap.issues.length ? (
          <EmptyState icon="vpn_lock" tone="warn" title="Sem conexão com o servidor" text={`Não foi possível acessar ${hostnameOf(s.prefs.host)}.${s.lastError ? ` Detalhe: ${s.lastError}.` : ''} Confira sua rede, VPN e as permissões do token.`}>
            <Button className="mt-2.5 h-[30px] px-3" icon="refresh" onClick={() => void s.refresh()}>Tentar novamente</Button>
          </EmptyState>
        ) : tab === 'pipes' && fails === 0 ? (
          <EmptyState icon="task_alt" tone="accent" title="Tudo em dia" text={EMPTY_TEXT.pipes(monitored.length, minLeft)} />
        ) : visibleCount === 0 ? (
          <EmptyState icon="task_alt" tone="accent" title="Tudo em dia" text={EMPTY_TEXT[tab](monitored.length, minLeft)} />
        ) : tab === 'issues' ? (
          issues.map((i) => <IssueCard key={i.key} issue={i} />)
        ) : tab === 'mrs' ? (
          mrs.map((m) => <MrCard key={m.key} mr={m} />)
        ) : tab === 'todos' ? (
          todos.map((d) => <TodoCard key={d.key} todo={d} />)
        ) : (
          pipes.map((p) => <PipeCard key={p.key} pipe={p} />)
        )}
      </div>

      {s.undoMute && (
        <div className="mx-3 mb-1.5 flex items-center gap-2 rounded-card bg-card px-3 py-1.5 text-[12px] shadow-flyout">
          <span className="flex-1">Projeto silenciado · {s.undoMute.name}</span>
          <button className="font-semibold text-accent-text" onClick={s.undoMuteProject}>Desfazer</button>
        </div>
      )}

      <div className="flex h-9 flex-none items-center gap-2 border-t border-stroke pl-3.5 pr-2 text-meta text-fg-3">
        <span className="flex-1">{footer}</span>
        {s.prefs.host && (
          <button onClick={() => void openExternal(s.prefs.host)} className="flex h-[26px] items-center gap-1 rounded-control px-1.5 font-semibold text-accent-text hover:bg-subtle">
            Abrir {sys.label}
            <Icon name="open_in_new" size={14} />
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="acrylic flex h-[520px] w-[380px] flex-col overflow-hidden rounded-flyout font-sans text-body shadow-flyout">{children}</div>;
}
