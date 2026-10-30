import { useRadar } from '../services/store';
import { openExternal } from '../services/platform';
import { relativeTime } from '../lib/time';
import { EmptyState, Icon, IconButton } from '../ui';

const ICON: Record<string, { icon: string; color: string }> = {
  simple: { icon: 'notifications', color: 'var(--rd-info)' },
  group: { icon: 'stacks', color: 'var(--rd-info)' },
  fail: { icon: 'cancel', color: 'var(--rd-danger)' },
  ok: { icon: 'check_circle', color: 'var(--rd-accent)' },
};

export function History() {
  const { history, setView, clearHistory } = useRadar();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 py-2.5 pl-1.5 pr-2 pb-2">
        <IconButton icon="arrow_back" title="Voltar" className="text-fg" onClick={() => setView('main')} />
        <span className="flex-1 text-header">Notificações recentes</span>
        {history.length > 0 && <IconButton icon="delete_sweep" title="Limpar histórico" onClick={clearHistory} />}
      </div>
      <div className="rd-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
        {history.length === 0 ? (
          <EmptyState icon="notifications_none" tone="accent" title="Nada por aqui" text="Os avisos que aparecerem como notificação ficam guardados aqui, mesmo depois que o toast some." />
        ) : (
          history.map((h) => {
            const m = ICON[h.variant];
            return (
              <div
                key={`${h.key}:${h.at}`}
                role="button"
                tabIndex={0}
                data-card
                onClick={() => void openExternal(h.url)}
                onKeyDown={(e) => e.key === 'Enter' && void openExternal(h.url)}
                className="box-border flex min-w-0 flex-none cursor-pointer gap-2 rounded-card border border-stroke bg-card px-2.5 py-2 outline-none hover:bg-card-hover"
              >
                <span className="mt-0.5 flex-none" style={{ color: m.color }}><Icon name={m.icon} size={18} fill /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="min-w-0 flex-1 truncate font-semibold">{h.title}</span>
                    <span className="flex-none text-meta text-fg-3">{relativeTime(new Date(h.at).toISOString())}</span>
                  </div>
                  <span className="truncate text-meta text-fg-2">{h.sub}</span>
                  <span className="truncate text-meta text-fg-3">{h.foot}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
