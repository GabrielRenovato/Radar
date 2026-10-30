import { useState } from 'react';
import type { Issue, MergeRequest, Pipeline, Todo } from '../types';
import { TODO_LABEL } from '../services/notifications';
import { Avatar, Button, Icon, IconButton, Label } from '../ui';
import { formatDuration, relativeTime } from '../lib/time';
import { isNew } from '../services/detect';
import { useRadar } from '../services/store';
import { openExternal } from '../services/platform';
import { useSummary } from '../services/ai';

const cardCls = 'flex-none min-w-0 max-w-full box-border flex flex-col rounded-card border border-stroke bg-card hover:bg-card-hover cursor-pointer outline-none';

const useNew = (key: string, updatedAt: string) => useRadar((s) => isNew(s.tracking, key, updatedAt));

function AiBlock({ issue }: { issue: Issue }) {
  const st = useSummary(issue);
  if (!st) return null;
  return (
    <div className="flex flex-col gap-1 rounded-card bg-subtle px-2.5 py-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold leading-[14px] text-accent-text">
        <Icon name="auto_awesome" size={14} />
        Resumo por IA
      </span>
      {st.s === 'loading' && (
        <>
          <span className="skel h-3 w-full" />
          <span className="skel h-3 w-2/3" />
        </>
      )}
      {st.s === 'err' && <span className="text-[12.5px] leading-[17px] text-fg-2">Resumo indisponível</span>}
      {st.s === 'ok' && (
        <>
          <span className="text-[12.5px] leading-[17px] [text-wrap:pretty]"><strong className="font-semibold">O que pedem:</strong> {st.v.pedem}</span>
          <span className="text-[12.5px] leading-[17px] [text-wrap:pretty]"><strong className="font-semibold">O que impacta:</strong> {st.v.impacta}</span>
        </>
      )}
    </div>
  );
}

export function IssueCard({ issue }: { issue: Issue }) {
  const { expanded, setExpanded, markRead, muteProject } = useRadar();
  const fresh = useNew(issue.key, issue.updatedAt);
  const [hover, setHover] = useState(false);
  const exp = expanded === issue.key;
  const read = () => markRead([{ key: issue.key, updatedAt: issue.updatedAt }]);
  const stop = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-card
      aria-expanded={exp}
      onClick={() => setExpanded(issue.key)}
      onKeyDown={(e) => e.key === 'Enter' && setExpanded(issue.key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${cardCls} gap-1 py-2 pl-2.5 pr-2`}
    >
      <div className="flex min-h-6 items-start gap-[7px]">
        <span className="mt-2 h-[7px] w-[7px] flex-none rounded-full" style={{ background: fresh ? 'var(--rd-info)' : 'transparent' }} />
        <span className={`min-w-0 flex-1 pt-[3px] font-semibold ${exp ? '' : 'truncate'}`}>{issue.title}</span>
        {hover && !exp ? (
          <div className="flex flex-none gap-0.5">
            <IconButton size={24} iconSize={17} icon="check" title="Marcar como lida" onClick={stop(read)} />
            <IconButton size={24} iconSize={17} icon="notifications_off" title="Silenciar projeto" onClick={stop(() => muteProject(issue.projectId))} />
          </div>
        ) : (
          <span className="flex-none pr-1 pt-[3px] text-meta text-fg-3">{relativeTime(issue.updatedAt)}</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-3.5">
        <Avatar person={issue.author} />
        <span className="min-w-0 flex-1 truncate text-meta text-fg-2">#{issue.iid} · {issue.project}</span>
        {issue.labels.slice(0, 2).map((l) => (
          <Label key={l.name} tone={l.tone}>{l.name}</Label>
        ))}
      </div>
      {exp && (
        <div className="flex flex-col gap-2 pl-3.5 pt-1.5" onClick={(e) => e.stopPropagation()}>
          <AiBlock issue={issue} />
          {issue.description && <span className="line-clamp-3 text-[12.5px] leading-[17px] text-fg-2 [text-wrap:pretty]">{issue.description}</span>}
          <div className="flex items-center gap-1.5">
            <Button variant="primary" icon="open_in_new" onClick={() => { read(); void openExternal(issue.webUrl); }}>Abrir no navegador</Button>
            <Button onClick={read}>Marcar como lida</Button>
            <span className="flex-1" />
            <IconButton size={28} iconSize={17} icon="notifications_off" title="Silenciar projeto" onClick={() => muteProject(issue.projectId)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function TodoCard({ todo }: { todo: Todo }) {
  const markRead = useRadar((s) => s.markRead);
  const dismiss = useRadar((s) => s.dismissTodos);
  const unread = useRadar((s) => s.tracking.read[todo.key] !== todo.updatedAt);
  const open = () => { markRead([{ key: todo.key, updatedAt: todo.updatedAt }]); void openExternal(todo.webUrl); };
  return (
    <div role="button" tabIndex={0} data-card onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} className={`${cardCls} gap-1 px-2.5 py-2`}>
      <div className="flex items-start gap-[7px]">
        <span className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full" style={{ background: unread ? 'var(--rd-info)' : 'transparent' }} />
        <span className="min-w-0 flex-1 truncate font-semibold">{todo.title}</span>
        <span className="flex-none text-meta text-fg-3">{relativeTime(todo.updatedAt)}</span>
        <IconButton size={22} iconSize={16} icon="close" title="Dispensar" onClick={(e) => { e.stopPropagation(); void dismiss([todo]); }} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-3.5">
        <Avatar person={todo.author} />
        <span className="min-w-0 flex-1 truncate text-meta text-fg-2">{todo.author.name} · {TODO_LABEL[todo.action]}</span>
        <span className="flex-none text-meta text-fg-3">{todo.targetRef}</span>
      </div>
      {todo.body && todo.action !== 'assigned' && <span className="line-clamp-2 pl-3.5 text-[12px] leading-[16px] text-fg-2 [text-wrap:pretty]">{todo.body}</span>}
    </div>
  );
}

const PIPE: Record<string, { icon: string; color: string; text: string; label: string }> = {
  ok: { icon: 'check_circle', color: 'var(--rd-accent)', text: 'var(--rd-accent-text)', label: 'passou' },
  fail: { icon: 'cancel', color: 'var(--rd-danger)', text: 'var(--rd-danger-text)', label: 'falhou' },
  running: { icon: 'pending', color: 'var(--rd-info)', text: 'var(--rd-fg2)', label: 'rodando' },
  none: { icon: 'pending', color: 'var(--rd-fg3)', text: 'var(--rd-fg3)', label: 'sem pipeline' },
};

export function MrCard({ mr }: { mr: MergeRequest }) {
  const fresh = useNew(mr.key, mr.updatedAt);
  const markRead = useRadar((s) => s.markRead);
  const p = PIPE[mr.pipe];
  return (
    <div
      role="button"
      tabIndex={0}
      data-card
      onClick={() => { markRead([{ key: mr.key, updatedAt: mr.updatedAt }]); void openExternal(mr.webUrl); }}
      onKeyDown={(e) => e.key === 'Enter' && void openExternal(mr.webUrl)}
      className={`${cardCls} gap-1 px-2.5 py-2`}
    >
      <div className="flex items-start gap-[7px]">
        <span className="mt-1.5 h-[7px] w-[7px] flex-none rounded-full" style={{ background: fresh ? 'var(--rd-info)' : 'transparent' }} />
        <span className="min-w-0 flex-1 truncate font-semibold">{mr.title}</span>
        <span className="flex-none text-meta text-fg-3">{relativeTime(mr.updatedAt)}</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-3.5">
        <Avatar person={mr.author} />
        <span className="min-w-0 flex-1 truncate text-meta text-fg-2">!{mr.iid} · {mr.project}</span>
        <span title="Aprovações" className="flex flex-none items-center gap-[3px] text-meta text-fg-2"><Icon name="thumb_up" size={14} />{mr.approvals}</span>
        <span title={`Pipeline ${p.label}`} className="flex-none" style={{ color: p.color }}><Icon name={p.icon} size={16} fill /></span>
      </div>
      <div className="flex min-w-0 items-center gap-1 pl-3.5 font-mono text-[11px] leading-[15px] text-fg-3">
        <Icon name="call_split" size={13} />
        <span className="truncate">{mr.branch}</span>
      </div>
    </div>
  );
}

export function PipeCard({ pipe }: { pipe: Pipeline }) {
  const { expanded, setExpanded, markRead, retryJob, tokenInfo } = useRadar();
  const exp = expanded === pipe.key && pipe.status === 'fail';
  const m = PIPE[pipe.status];
  const canRetry = !!tokenInfo?.scopes.includes('api') && !!pipe.failedJob;
  return (
    <div
      role="button"
      tabIndex={0}
      data-card
      aria-expanded={exp}
      onClick={() => setExpanded(pipe.key)}
      onKeyDown={(e) => e.key === 'Enter' && setExpanded(pipe.key)}
      className={`${cardCls} gap-1.5 px-2.5 py-2`}
    >
      <div className="flex items-start gap-[9px]">
        <span className="mt-px flex-none" style={{ color: m.color }}><Icon name={m.icon} size={20} fill /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold">{pipe.name}</span>
            <span className="text-meta font-semibold" style={{ color: m.text }}>{m.label}</span>
            <span className="flex-1" />
            <span className="text-meta text-fg-3">{relativeTime(pipe.updatedAt)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-meta text-fg-2">
            <span className="min-w-0 flex-1 truncate">#{pipe.id} · {pipe.project} · {pipe.ref}</span>
            <span className="flex flex-none items-center gap-[3px] text-fg-3"><Icon name="timer" size={14} />{formatDuration(pipe.durationSec)}</span>
          </div>
        </div>
      </div>
      {exp && (
        <div className="flex flex-col gap-2 pl-[29px]" onClick={(e) => e.stopPropagation()}>
          {pipe.failedJob && (
            <div className="flex flex-col gap-[3px] rounded-card bg-danger-tint px-2.5 py-2">
              <span className="text-[12.5px] font-semibold leading-[17px] text-danger-text">Job {pipe.failedJob.name} falhou na etapa {pipe.failedJob.stageIndex} de {pipe.failedJob.stageTotal}</span>
              {pipe.failedJob.tail && <span className="font-mono text-[11px] leading-[15px] text-fg-2">{pipe.failedJob.tail}</span>}
            </div>
          )}
          <div className="flex gap-1.5">
            <Button variant="primary" icon="open_in_new" onClick={() => { markRead([{ key: pipe.key, updatedAt: pipe.updatedAt }]); void openExternal(pipe.webUrl); }}>Abrir no navegador</Button>
            {canRetry && <Button icon="replay" onClick={() => void retryJob(pipe.projectId, pipe.failedJob!.id)}>Rodar job de novo</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
