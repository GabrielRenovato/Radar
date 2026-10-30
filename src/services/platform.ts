import type { ToastPayload } from '../types';
import { bridge } from '../lib/env';

export const stateStorage = {
  async getItem(name: string): Promise<string | null> {
    return bridge() ? bridge()!.loadState() : localStorage.getItem(name);
  },
  async setItem(name: string, value: string): Promise<void> {
    if (bridge()) await bridge()!.saveState(value);
    else localStorage.setItem(name, value);
  },
  async removeItem(name: string): Promise<void> {
    if (!bridge()) localStorage.removeItem(name);
  },
};

export const secrets = {
  get: () => bridge()?.getToken() ?? Promise.resolve(null),
  set: (token: string) => bridge()?.setToken(token) ?? Promise.resolve(),
  clear: () => bridge()?.clearToken() ?? Promise.resolve(),
};

export async function openExternal(url: string) {
  if (bridge()) await bridge()!.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

export const allowHost = async (hostname: string) => bridge()?.allowHost(hostname);
export const checkUpdate = async () => (await bridge()?.checkUpdate()) ?? 'Disponível só no app instalado.';export const setAutostart = async (on: boolean) => bridge()?.setAutostart(on);
export const hidePopup = () => bridge()?.hidePopup();
export const showToast = async (payload: ToastPayload) => bridge()?.showToast(payload);

// No Electron as chamadas HTTP saem pelo processo principal (sem CORS); no navegador usa fetch normal.
export async function httpFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  const b = bridge();
  if (!b) return fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const { status, text } = await b.http({ url, ...init });
  return new Response(status === 204 || status === 205 ? null : text, { status });
}
