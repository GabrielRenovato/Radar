import { describe, expect, it } from 'vitest';
import { mockSnapshot } from './gitlab/mock';
import { resolveClosed, syncWatch, type IssueState } from './watch';

const closedBy = { name: 'Rafael Souza', initials: 'RS', tone: 'indigo' as const };
const state = (s: IssueState['state']) => async (): Promise<IssueState> => ({ state: s, closedBy, closedAt: new Date().toISOString() });

describe('watch', () => {
  it('vigia issues minhas e as de menção/atribuição via To-Do', () => {
    const w = syncWatch({}, mockSnapshot());
    expect(w['issue:1:1284']?.seenOpen).toBe(true);
    expect(w['issue:3:1277']).toBeUndefined();
  });

  it('avisa quando uma issue vigiada deixa de estar aberta e fechada de fato', async () => {
    const s = mockSnapshot();
    const watch = syncWatch({}, s);
    s.issues = s.issues.filter((i) => i.key !== 'issue:1:1284');
    const r = await resolveClosed(watch, s, state('closed'));
    expect(r.closed.map((c) => c.key)).toEqual(['issue:1:1284']);
    expect(r.closed[0].closedBy.name).toBe('Rafael Souza');
    expect(r.watch['issue:1:1284'].closed).toBe(true);
  });

  it('não avisa de novo nem recria a vigia da issue já resolvida', async () => {
    const s = mockSnapshot();
    s.issues = s.issues.filter((i) => i.key !== 'issue:1:1284');
    const resolved = (await resolveClosed(syncWatch({}, mockSnapshot()), s, state('closed'))).watch;
    const again = await resolveClosed(syncWatch(resolved, s), s, state('closed'));
    expect(again.closed).toHaveLength(0);
  });

  it('issue que ainda está aberta (saiu do filtro) não gera aviso', async () => {
    const s = mockSnapshot();
    const watch = syncWatch({}, s);
    s.issues = [];
    expect((await resolveClosed(watch, s, state('opened'))).closed).toHaveLength(0);
  });

  it('issue de menção já fechada na primeira vista é descartada em silêncio', async () => {
    const s = mockSnapshot();
    s.issues = [];
    const r = await resolveClosed(syncWatch({}, s), s, state('closed'));
    expect(r.closed).toHaveLength(0);
  });
});
