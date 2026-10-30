import { describe, expect, it } from 'vitest';
import { isDndActive, isValidTime, type DndConfig } from './dnd';

const cfg: DndConfig = { on: true, start: '19:00', end: '08:00', days: [1, 2, 3, 4, 5] };
const at = (iso: string) => new Date(iso);

describe('isDndActive', () => {
  it('ativa à noite em dia útil', () => expect(isDndActive(cfg, at('2026-10-28T20:00:00'))).toBe(true));
  it('ativa de madrugada quando a janela começou no dia útil anterior', () => expect(isDndActive(cfg, at('2026-10-29T07:30:00'))).toBe(true));
  it('inativa durante o expediente', () => expect(isDndActive(cfg, at('2026-10-28T14:00:00'))).toBe(false));
  it('inativa na madrugada de segunda (janela começou no domingo)', () => expect(isDndActive(cfg, at('2026-11-02T07:30:00'))).toBe(false));
  it('inativa no sábado à noite', () => expect(isDndActive(cfg, at('2026-10-31T20:00:00'))).toBe(false));
  it('desligado nunca ativa', () => expect(isDndActive({ ...cfg, on: false }, at('2026-10-28T20:00:00'))).toBe(false));
  it('janela no mesmo dia', () => expect(isDndActive({ ...cfg, start: '12:00', end: '14:00' }, at('2026-10-28T13:00:00'))).toBe(true));
});

describe('isValidTime', () => {
  it('valida HH:MM', () => {
    expect(isValidTime('19:00')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
  });
});
