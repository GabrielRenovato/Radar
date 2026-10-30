import { useState } from 'react';
import type { ProjectRef } from '../types';
import { useRadar, type Prefs } from '../services/store';
import { MockGitlabClient, mockSnapshot } from '../services/gitlab/mock';
import { createClient, hostnameOf, PROVIDERS, type ProviderKind } from '../services/providers';
import { notify } from '../services/notifications';
import { checkUpdate, secrets } from '../services/platform';
import { version } from '../../package.json';
import { isValidTime } from '../lib/dnd';
import { Button, Icon, IconButton, SettingsCard, Toggle } from '../ui';

const INTERVALS: Prefs['interval'][] = [1, 2, 5, 10, 15];
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const Section = ({ children }: { children: string }) => <span className="px-0.5 pt-2 text-meta font-semibold text-fg-2">{children}</span>;

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span>{title}</span>
        {hint && <span className="text-meta text-fg-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const bad = !isValidTime(draft);
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={5}
      onChange={(e) => {
        setDraft(e.target.value);
        if (isValidTime(e.target.value)) onChange(e.target.value);
      }}
      onBlur={() => bad && setDraft(value)}
      className={`h-7 w-16 rounded-control border bg-input px-2.5 text-center tabular-nums outline-none ${bad ? 'border-danger' : 'border-stroke-2'}`}
    />
  );
}

function TokenField() {
  const { hasToken, tokenTail, tokenInfo, tokenError, saveToken, demo, prefs } = useRadar();
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<ProviderKind>(prefs.provider);
  const [host, setHost] = useState(prefs.host);
  const info = PROVIDERS[provider];
  const pending = provider !== prefs.provider || host.trim().replace(/\/+$/, '') !== prefs.host;
  const masked = hasToken ? `${provider === 'gitlab' ? 'glpat-' : ''}${'•'.repeat(16)}${tokenTail}` : '';
  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    if (await saveToken(draft.trim(), { provider, host })) setDraft('');
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <span>Sistema</span>
      <select
        aria-label="Sistema"
        value={provider}
        disabled={demo}
        onChange={(e) => {
          const k = e.target.value as ProviderKind;
          setProvider(k);
          setHost(k === prefs.provider ? prefs.host : '');
        }}
        className="h-8 rounded-control border border-stroke-2 bg-input px-2 text-[12.5px]"
      >
        {(Object.keys(PROVIDERS) as ProviderKind[]).map((k) => <option key={k} value={k}>{PROVIDERS[k].label}</option>)}
      </select>
      <span className="pt-1">Endereço do servidor</span>
      <input
        value={host}
        onChange={(e) => setHost(e.target.value)}
        disabled={demo}
        placeholder={info.hostPlaceholder}
        spellCheck={false}
        className="h-8 rounded-control border border-stroke-2 bg-input px-2.5 font-mono text-[12px] outline-none"
      />
      {pending && <span className="text-meta text-warn-text">Informe o token abaixo para aplicar. Trocar de sistema ou servidor limpa a lista e o histórico atuais.</span>}
      <span className="pt-1">Token de acesso pessoal</span>
      <div className="flex h-8 items-center rounded-control border border-stroke-2 border-b-fg-3 bg-input pl-2.5 pr-0.5">
        <input
          type={show || !draft ? 'text' : 'password'}
          value={draft || (hasToken && !show ? masked : '')}
          placeholder={hasToken && !pending ? '' : info.tokenPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          onBlur={() => void submit()}
          disabled={demo || busy}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] tracking-[.02em] outline-none"
        />
        <IconButton icon={show ? 'visibility_off' : 'visibility'} title="Mostrar token" size={28} iconSize={17} onClick={() => setShow((v) => !v)} />
      </div>
      {tokenError ? (
        <span className="text-meta text-danger-text">{tokenError}</span>
      ) : (
        <span className="text-meta text-fg-3">
          {tokenInfo && !pending ? `${tokenInfo.scopes.length ? `Escopo ${tokenInfo.scopes.join(', ')}` : 'Token validado'}${tokenInfo.expiresAt ? ` · expira em ${new Date(tokenInfo.expiresAt).toLocaleDateString('pt-BR')}` : ''}` : info.tokenHint}
        </span>
      )}
    </div>
  );
}

function UpdateRow() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    setMsg(await checkUpdate());
    setBusy(false);
  };
  return (
    <Row title="Atualizações" hint={msg || `Versão ${version}; o app procura versões novas sozinho a cada poucas horas`}>
      <Button icon="system_update_alt" onClick={() => void check()} disabled={busy}>Verificar</Button>
    </Row>
  );
}

function AddProject() {
  const { addProject, projects, demo, prefs } = useRadar();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ProjectRef[]>([]);
  const search = async (v: string) => {
    setQ(v);
    const token = demo ? null : await secrets.get();
    const c = demo ? new MockGitlabClient() : token ? createClient(prefs.provider, prefs.host, token) : null;
    setRes(c ? (await c.searchProjects(v).catch(() => [])).filter((p) => !projects.some((x) => x.id === p.id)) : []);
  };
  return (
    <>
      <button onClick={() => { setOpen((o) => !o); void search(''); }} className="flex h-9 items-center gap-1.5 rounded-b-card px-3 font-semibold text-accent-text hover:bg-subtle">
        <Icon name="add" size={17} />
        Adicionar projeto
      </button>
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-2.5">
          <input autoFocus value={q} onChange={(e) => void search(e.target.value)} placeholder="Buscar projeto…" className="h-8 rounded-control border border-stroke-2 bg-input px-2.5 outline-none" />
          {res.slice(0, 6).map((p) => (
            <button key={p.id} onClick={() => { addProject(p); setOpen(false); }} className="flex flex-col rounded-control px-2 py-1 text-left hover:bg-subtle">
              <span>{p.name}</span>
              <span className="text-meta text-fg-3">{p.group}</span>
            </button>
          ))}
          {res.length === 0 && <span className="px-2 text-meta text-fg-3">Nenhum projeto encontrado.</span>}
        </div>
      )}
    </>
  );
}

export function Settings() {
  const { prefs, setPref, projects, setProjectMonitored, setView } = useRadar();  const dnd = prefs.dnd;
  const setDnd = (patch: Partial<typeof dnd>) => setPref('dnd', { ...dnd, ...patch });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 py-2.5 pl-1.5 pr-2 pb-2">
        <IconButton icon="arrow_back" title="Voltar" className="text-fg" onClick={() => setView('main')} />
        <span className="text-header">Configurações</span>
      </div>
      <div className="rd-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-3 pb-3.5">
        <Section>Conexão</Section>
        <SettingsCard>
          <TokenField />
          <Row title="Intervalo de verificação">
            <select aria-label="Intervalo de verificação" value={prefs.interval} onChange={(e) => setPref('interval', Number(e.target.value) as Prefs['interval'])} className="h-7 rounded-control border border-stroke-2 bg-input px-2 text-[12.5px]">
              {INTERVALS.map((n) => <option key={n} value={n}>{n === 1 ? 'A cada 1 min' : `A cada ${n} min`}</option>)}
            </select>
          </Row>
        </SettingsCard>

        <Section>Projetos monitorados</Section>
        <SettingsCard>
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col"><span>{p.name}</span><span className="text-meta text-fg-3">{p.group}</span></div>
              <Toggle on={p.monitored} label={`Monitorar ${p.name}`} onChange={(v) => setProjectMonitored(p.id, v)} />
            </div>
          ))}
          <AddProject />
        </SettingsCard>

        <Section>Notificações</Section>
        <SettingsCard>
          <Row title="Não perturbe" hint="Silencia toasts; a lista continua atualizando">
            <Toggle on={dnd.on} label="Não perturbe" onChange={(on) => setDnd({ on })} />
          </Row>
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 pt-2 text-[12.5px] text-fg-2 transition-opacity" style={{ opacity: dnd.on ? 1 : 0.45 }} aria-disabled={!dnd.on}>
            <span>Das</span>
            <TimeField label="Início" value={dnd.start} onChange={(start) => setDnd({ start })} />
            <span>às</span>
            <TimeField label="Fim" value={dnd.end} onChange={(end) => setDnd({ end })} />
            <div className="flex gap-1" role="group" aria-label="Dias">
              {DAYS.map((d, i) => (
                <button key={i} aria-pressed={dnd.days.includes(i)} title={['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][i]} onClick={() => setDnd({ days: dnd.days.includes(i) ? dnd.days.filter((x) => x !== i) : [...dnd.days, i] })} className={`h-6 w-6 rounded-full text-[11px] ${dnd.days.includes(i) ? 'bg-accent text-accent-on' : 'bg-subtle text-fg-2'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <Row title="Resumo por IA" hint="Mostra “o que pedem / o que impacta” ao expandir">
            <Toggle on={prefs.ai} label="Resumo por IA" onChange={(v) => setPref('ai', v)} />
          </Row>
          {prefs.ai && (
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <span className="text-meta text-fg-2">Endpoint de IA (aprovado pela segurança)</span>
              <input value={prefs.aiEndpoint} onChange={(e) => setPref('aiEndpoint', e.target.value)} placeholder="https://…/v1/chat/completions" className="h-8 rounded-control border border-stroke-2 bg-input px-2.5 font-mono text-[12px] outline-none" />
            </div>
          )}
          <Row title="Lembretes do Radinho" hint="Lembra das notificações quando passa horas sem abrir o app e avisa se um MR seu fica 24 h sem review">
            <Toggle on={prefs.nudge} label="Lembretes do Radinho" onChange={(v) => setPref('nudge', v)} />
          </Row>
          <div className="flex flex-wrap gap-2 px-3 py-2.5">
            <Button icon="pets" onClick={() => useRadar.getState().maybeNudge(true)}>
              Testar Radinho
            </Button>
            <Button icon="notifications_active" onClick={() => { const s = mockSnapshot(); void notify([{ kind: 'issue', item: s.issues[0] }, { kind: 'pipe-fail', item: s.pipes[0] }]); }}>
              Testar notificação
            </Button>
          </div>
        </SettingsCard>

        <Section>Sistema</Section>
        <SettingsCard>
          <Row title="Iniciar com o Windows"><Toggle on={prefs.autostart} label="Iniciar com o Windows" onChange={(v) => setPref('autostart', v)} /></Row>
          <UpdateRow />
        </SettingsCard>
        <span className="px-0.5 pt-2 text-meta text-fg-3">Radar {version} · {PROVIDERS[prefs.provider].label} {prefs.host && ` · ${hostnameOf(prefs.host)}`}</span>
        <span className="px-0.5 text-meta text-fg-3">Inspirado em uma aplicação da dev Karolyne Martins Rodrigues de Lima.</span>
      </div>
    </div>
  );
}
