export interface DndConfig {
  on: boolean;
  start: string;
  end: string;
  days: number[];
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isValidTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// Janela que vira o dia (19:00–08:00) pertence ao dia em que começou; de madrugada vale o dia anterior.
export function isDndActive(cfg: DndConfig, now = new Date()): boolean {
  if (!cfg.on || !isValidTime(cfg.start) || !isValidTime(cfg.end)) return false;
  const s = toMin(cfg.start);
  const e = toMin(cfg.end);
  const cur = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  if (s === e) return false;
  if (s < e) return cfg.days.includes(day) && cur >= s && cur < e;
  if (cur >= s) return cfg.days.includes(day);
  if (cur < e) return cfg.days.includes((day + 6) % 7);
  return false;
}
