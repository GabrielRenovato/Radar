const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = ['menu:pause', 'menu:settings', 'toast-open', 'toast-action'];

contextBridge.exposeInMainWorld('radar', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (json) => ipcRenderer.invoke('state:save', json),
  getToken: () => ipcRenderer.invoke('token:get'),
  setToken: (token) => ipcRenderer.invoke('token:set', token),
  clearToken: () => ipcRenderer.invoke('token:clear'),
  http: (req) => ipcRenderer.invoke('http', req),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  allowHost: (hostname) => ipcRenderer.invoke('host:allow', hostname),
  checkUpdate: () => ipcRenderer.invoke('update:check'),  setAutostart: (on) => ipcRenderer.invoke('autostart', on),
  hidePopup: () => ipcRenderer.send('popup:hide'),
  updateTray: (payload) => ipcRenderer.send('tray:update', payload),
  showToast: (payload) => ipcRenderer.invoke('toast:show', payload),
  toastSize: (height) => ipcRenderer.send('toast:size', height),
  toastOpen: (keys, url) => ipcRenderer.invoke('toast:open', { keys, url }),
  toastAction: (action, tab, url) => ipcRenderer.invoke('toast:action', { action, tab, url }),
  toastClose: () => ipcRenderer.send('toast:close'),
  on: (channel, cb) => {
    if (!ALLOWED.includes(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
