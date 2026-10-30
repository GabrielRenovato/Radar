import type { Tab, ToastPayload } from '../types';

export interface RadarBridge {
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  http(req: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; text: string }>;
  openExternal(url: string): Promise<void>;
  allowHost(hostname: string): Promise<void>;
  checkUpdate(): Promise<string>;  setAutostart(on: boolean): Promise<void>;
  hidePopup(): void;
  updateTray(p: { rgba: Uint8Array; size: number; tooltip: string }): void;
  showToast(p: ToastPayload): Promise<void>;
  toastSize(height: number): void;
  toastOpen(keys: string[], url: string): Promise<void>;
  toastAction(action: 'view' | 'later' | 'stop', tab: Tab, url?: string): Promise<void>;
  toastClose(): void;
  on(channel: 'menu:pause' | 'menu:settings' | 'toast-open' | 'toast-action', cb: (data: any) => void): () => void;
}

declare global {
  interface Window {
    radar?: RadarBridge;
  }
}

export const bridge = () => (typeof window !== 'undefined' ? window.radar : undefined);
export const isNative = () => !!bridge();
