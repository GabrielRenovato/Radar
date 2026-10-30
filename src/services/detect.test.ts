import { describe, expect, it } from 'vitest';
import { detect, emptyTracking, isNew, retryDelaySec } from './detect';
import { mockSnapshot } from './gitlab/mock';
import { classifyError } from './gitlab/client';

describe('detect', () => {
  it('primeira execução grava a base sem eventos', () => {
    const { tracking, events } = detect(mockSnapshot(), emptyTracking());
    expect(events).toHaveLength(0);
    expect(tracking.initialized).toBe(true);
    expect(Object.keys(tracking.seen).length).toBeGreaterThan(0);
  });

  it('item novo gera evento e fica "novo" até ser lido', () => {
    const base = detect(mockSnapshot(), emptyTracking()).tracking;
    const s = mockSnapshot();
    s.issues.push({ ...s.issues[0], key: 'issue:1:9999', iid: 9999 });
    const { tracking, events } = detect(s, base);
    expect(events.map((e) => e.kind)).toEqual(['issue']);
    expect(isNew(tracking, 'issue:1:9999', s.issues[5].updatedAt)).toBe(true);
    const read = { ...tracking, read: { 'issue:1:9999': s.issues[5].updatedAt } };
    expect(isNew(read, 'issue:1:9999', s.issues[5].updatedAt)).toBe(false);
  });

  it('to-do novo gera evento; estado antigo sem todosInit só grava a base', () => {
    const base = detect(mockSnapshot(), emptyTracking()).tracking;
    const s = mockSnapshot();
    s.todos.push({ ...s.todos[0], key: 'todo:999', id: 999 });
    expect(detect(s, base).events.map((e) => e.kind)).toEqual(['todo']);

    const legacy = { ...base, todosInit: undefined, seen: Object.fromEntries(Object.entries(base.seen).filter(([k]) => !k.startsWith('todo:'))) as typeof base.seen };
    const first = detect(s, legacy);
    expect(first.events).toHaveLength(0);
    expect(first.tracking.todosInit).toBe(true);
  });

  it('item lido volta a ser novo quando updated_at muda', () => {
    const s = mockSnapshot();
    const base = detect(s, emptyTracking()).tracking;
    const key = s.issues[0].key;
    const t1 = { ...base, fresh: { ...base.fresh, [key]: true as const }, read: { [key]: s.issues[0].updatedAt } };
    expect(isNew(t1, key, s.issues[0].updatedAt)).toBe(false);
    const s2 = mockSnapshot();
    s2.issues[0].updatedAt = new Date().toISOString();
    const t2 = detect(s2, t1);
    expect(t2.events).toHaveLength(0);
    expect(isNew(t2.tracking, key, s2.issues[0].updatedAt)).toBe(true);
  });

  it('"Deploy QA passou" só depois de falha anterior na mesma ref', () => {
    const s = mockSnapshot();
    const base = detect(s, emptyTracking()).tracking;
    const ok = { ...s.pipes[0], key: 'pipe:3:88420', id: 88420, status: 'ok' as const, updatedAt: new Date().toISOString() };
    expect(detect({ ...s, pipes: [...s.pipes, ok] }, base).events.map((e) => e.kind)).toEqual(['pipe-ok']);
    const plain = { ...ok, key: 'pipe:1:88421', projectId: 1, ref: 'develop' };
    expect(detect({ ...s, pipes: [...s.pipes, plain] }, base).events).toHaveLength(0);
  });
});

describe('retry e erros', () => {
  it('backoff 30s, 1min, 2min, depois 5min', () => {
    expect([0, 1, 2, 3, 10].map(retryDelaySec)).toEqual([30, 60, 120, 300, 300]);
  });
  it('classifica 401 como auth e falha de transporte como network', () => {
    expect(classifyError(null, 401).kind).toBe('auth');
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifyError(null, 500).kind).toBe('http');
  });
});
