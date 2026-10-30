import { describe, expect, it } from 'vitest';
import { emptyNudge, nudgeMessage, shouldNudge, staleMrs, type NudgeCounts, type NudgeInput } from './nudge';

const H = 3600_000;
const wed10 = new Date(2026, 9, 28, 14, 0).getTime();
const counts: NudgeCounts = { stale: [], fails: [], todos: 2, mrs: 1, issues: 0 };
const base = (over: Partial<NudgeInput> = {}): NudgeInput => ({ enabled: true, quiet: false, now: wed10, lastOpenedAt: wed10 - 4 * H, nudge: emptyNudge(), counts, ...over });

describe('shouldNudge', () => {
  it('aparece com pendência, ocioso há 3 h+ e em horário comercial', () => {
    expect(shouldNudge(base())).toBe(true);
  });

  it('não aparece sem pendência, desligado, em silêncio ou recém-aberto', () => {
    expect(shouldNudge(base({ counts: { stale: [], fails: [], todos: 0, mrs: 0, issues: 0 } }))).toBe(false);
    expect(shouldNudge(base({ enabled: false }))).toBe(false);
    expect(shouldNudge(base({ quiet: true }))).toBe(false);
    expect(shouldNudge(base({ lastOpenedAt: wed10 - 1 * H }))).toBe(false);
  });

  it('não aparece à noite nem no fim de semana', () => {
    expect(shouldNudge(base({ now: new Date(2026, 9, 28, 20, 0).getTime(), lastOpenedAt: null }))).toBe(false);
    expect(shouldNudge(base({ now: new Date(2026, 9, 31, 11, 0).getTime(), lastOpenedAt: null }))).toBe(false);
  });

  it('respeita adiamento, limite diário e espaçamento', () => {
    expect(shouldNudge(base({ nudge: { ...emptyNudge(), snoozeUntil: wed10 + H } }))).toBe(false);
    expect(shouldNudge(base({ nudge: { ...emptyNudge(), day: '2026-10-28', count: 2, lastAt: wed10 - 5 * H } }))).toBe(false);
    expect(shouldNudge(base({ nudge: { ...emptyNudge(), lastAt: wed10 - 2 * H } }))).toBe(false);
  });

  it('após 3 lembretes ignorados dobra o espaçamento', () => {
    const n = { ...emptyNudge(), ignored: 3, lastAt: wed10 - 4 * H };
    expect(shouldNudge(base({ nudge: n }))).toBe(false);
    expect(shouldNudge(base({ nudge: { ...n, lastAt: wed10 - 6 * H } }))).toBe(true);
  });
});

describe('nudgeMessage', () => {
  it('prioriza pipeline falhada', () => {
    const m = nudgeMessage({ ...counts, fails: [{ name: 'Deploy QA', project: 'portal-web' }] });
    expect(m.tab).toBe('pipes');
    expect(m.sub).toContain('Deploy QA de portal-web');
  });

  it('resume menções e MRs', () => {
    expect(nudgeMessage(counts)).toEqual({ tab: 'todos', sub: 'Tem 2 menções e 1 MR para revisar esperando você.' });
  });
});

describe('staleMrs', () => {
  const mr = (createdAt: string, reviewed = false) => ({ key: createdAt, title: 'feat: x', project: 'proj', webUrl: 'http://h/mr', createdAt, reviewed });
  const ago = (h: number) => new Date(wed10 - h * H).toISOString();

  it('só pega MR meu sem review e aberto há 24 h+, o mais antigo primeiro', () => {
    const r = staleMrs([mr(ago(5)), mr(ago(30), true), mr(ago(50)), mr(ago(26))], wed10);
    expect(r.map((s) => s.days)).toEqual([2, 1]);
  });

  it('o lembrete cita o MR, leva direto a ele e conta como pendência', () => {
    const stale = staleMrs([mr(ago(50))], wed10);
    const m = nudgeMessage({ stale, fails: [], todos: 0, mrs: 0, issues: 0 });
    expect(m).toMatchObject({ tab: 'mrs', url: 'http://h/mr', title: 'Seu MR está esperando review' });
    expect(m.sub).toContain('há 2 dias');
    expect(shouldNudge(base({ counts: { stale, fails: [], todos: 0, mrs: 0, issues: 0 } }))).toBe(true);
  });

  it('pipeline falhada continua tendo prioridade', () => {
    const m = nudgeMessage({ stale: staleMrs([mr(ago(50))], wed10), fails: [{ name: 'Deploy QA', project: 'p' }], todos: 0, mrs: 0, issues: 0 });
    expect(m.tab).toBe('pipes');
  });
});
