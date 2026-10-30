import { useEffect, useState } from 'react';
import type { Issue } from '../types';
import { useRadar } from './store';
import { httpFetch } from './platform';

export interface Summary {
  pedem: string;
  impacta: string;
}

const PROMPT =
  'Resuma a issue abaixo para um desenvolvedor em duas frases curtas. Responda só em JSON: {"pedem": "o que está sendo pedido", "impacta": "quem ou o que é afetado"}. Não invente informação que não esteja no texto.';
const MAX_CHARS = 4000;
const CACHE_KEY = 'radar-ai-cache';

const cache: Record<string, Summary> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
})();

export function parseSummary(raw: string): Summary | null {
  try {
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return typeof j.pedem === 'string' && typeof j.impacta === 'string' ? { pedem: j.pedem, impacta: j.impacta } : null;
  } catch {
    return null;
  }
}

// Endpoint compatível com chat/completions. Só é chamado ao expandir o card, nunca no polling.
export async function summarize(issue: Issue, endpoint: string, demo: boolean): Promise<Summary> {
  const ck = `${issue.key}@${issue.updatedAt}`;
  if (cache[ck]) return cache[ck];
  let out: Summary | null;
  if (demo && !endpoint) {
    out = { pedem: issue.description ? issue.description.split('. ')[0].replace(/\.$/, '') + '.' : issue.title, impacta: `Time responsável por ${issue.project}.` };
  } else {
    if (!endpoint) throw new Error('endpoint não configurado');
    const res = await httpFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: `${issue.title}\n\n${issue.description}`.slice(0, MAX_CHARS) }] }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    out = parseSummary(body?.choices?.[0]?.message?.content ?? '');
  }
  if (!out) throw new Error('resposta inválida');
  cache[ck] = out;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* cache é só otimização */
  }
  return out;
}

export function useSummary(issue: Issue) {
  const enabled = useRadar((s) => s.prefs.ai);
  const endpoint = useRadar((s) => s.prefs.aiEndpoint);
  const demo = useRadar((s) => s.demo);
  const [state, setState] = useState<{ s: 'loading' } | { s: 'ok'; v: Summary } | { s: 'err' }>({ s: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ s: 'loading' });
    summarize(issue, endpoint, demo).then(
      (v) => live && setState({ s: 'ok', v }),
      () => live && setState({ s: 'err' }),
    );
    return () => {
      live = false;
    };
  }, [issue.key, issue.updatedAt, enabled, endpoint, demo]);
  return enabled ? state : null;
}
