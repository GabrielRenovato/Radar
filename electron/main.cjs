// Radar — inspirado em uma aplicação da dev Karolyne Martins Rodrigues de Lima.
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, safeStorage, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Hosts do sistema de issues (GitLab/Azure DevOps) em que o app pode abrir links e falar via http; o renderer registra o configurado.
const trustedHosts = new Set();
const DEV = process.env.ELECTRON_DEV === '1';
const PAD = 16; // folga transparente ao redor para a sombra do flyout não ser cortada
const POPUP_W = 380 + PAD * 2;
const POPUP_H = 520 + PAD * 2;
const TOAST_W = 364 + PAD * 2;
const MARGIN = 12;
const APPDATA_DIR = process.env.APPDATA || app.getPath('appData');
const STATE_DIR = path.join(APPDATA_DIR, 'Radar');
// Versões anteriores guardavam estado e token em "GitLabRadar"; move uma vez para não perder a conexão.
const LEGACY_DIR = path.join(APPDATA_DIR, 'GitLabRadar');
if (!fs.existsSync(STATE_DIR) && fs.existsSync(LEGACY_DIR)) fs.renameSync(LEGACY_DIR, STATE_DIR);

if (!app.requestSingleInstanceLock()) app.quit();

let tray = null;
let popup = null;
let hiddenAt = 0;
const toasts = [];

const pageUrl = (query = '') =>
  DEV ? `http://localhost:1420/?${query}` : `${pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href}?${query}`;

const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && trustedHosts.has(u.hostname);
  } catch {
    return false;
  }
}

function createPopup() {
  popup = new BrowserWindow({
    width: POPUP_W, height: POPUP_H, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true, webPreferences,
  });
  popup.setMenu(null);
  popup.loadURL(pageUrl());
  popup.on('blur', () => {
    hiddenAt = Date.now();
    popup.hide();
  });
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function showPopup() {
  const b = tray.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const x = clamp(Math.round(b.x + b.width / 2 - POPUP_W / 2), wa.x - PAD + MARGIN, wa.x + wa.width - POPUP_W + PAD - MARGIN);
  const above = b.y > wa.y + wa.height / 2;
  const y = above ? b.y - POPUP_H + PAD - MARGIN : b.y + b.height - PAD + MARGIN;
  popup.setBounds({ x, y: clamp(y, wa.y - PAD, wa.y + wa.height - POPUP_H + PAD), width: POPUP_W, height: POPUP_H });
  popup.show();
  popup.focus();
}

function togglePopup() {
  if (popup.isVisible()) return popup.hide();
  if (Date.now() - hiddenAt < 250) return;
  showPopup();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Radar');
  tray.on('click', togglePopup);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir', click: showPopup },
      { label: 'Pausar avisos por 1 h', click: () => popup.webContents.send('menu:pause') },
      { label: 'Configurações', click: () => { popup.webContents.send('menu:settings'); showPopup(); } },
      ...(updateReady ? [{ label: `Reiniciar para atualizar (v${updateReady})`, click: () => require('electron-updater').autoUpdater.quitAndInstall() }] : []),
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]),
  );
}

// Atualização automática: baixa em segundo plano e instala ao fechar o app (ou pelo item "Reiniciar" da bandeja).
const UPDATE_EVERY_MS = 4 * 3600_000;
let updateReady = null;

function setupUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = info.version;
    refreshTrayMenu();
    tray.displayBalloon({ title: 'Radar', content: `A versão ${info.version} está pronta. Use "Reiniciar para atualizar" na bandeja ou ela entra ao fechar o app.` });
  });
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_EVERY_MS);

  ipcMain.handle('update:check', async () => {
    if (updateReady) return `Versão ${updateReady} pronta: reinicie para atualizar.`;
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      return v && v !== app.getVersion() ? `Baixando a versão ${v}…` : 'Você está na versão mais recente.';
    } catch {
      return 'Não foi possível verificar agora.';
    }
  });}

function layoutToasts() {
  const wa = screen.getPrimaryDisplay().workArea;
  let bottom = wa.y + wa.height - MARGIN + PAD;
  for (const t of toasts) {
    const [, h] = t.getSize();
    t.setPosition(wa.x + wa.width - TOAST_W + PAD - MARGIN, bottom - h);
    bottom -= h - PAD * 2 + 8;
  }
}

function createToast(payload) {
  const win = new BrowserWindow({
    width: TOAST_W, height: 240, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false, webPreferences,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(pageUrl(`view=toast&data=${encodeURIComponent(JSON.stringify(payload))}`));
  toasts.unshift(win);
  win.on('closed', () => {
    toasts.splice(toasts.indexOf(win), 1);
    layoutToasts();
  });
}

// O Radinho é uma janela própria (bolha + mascote flutuando no canto da tela), uma por vez.
const MASCOT_W = 300 + PAD * 2;
let mascot = null;

function createMascot(payload) {
  mascot?.close();
  const win = new BrowserWindow({
    width: MASCOT_W, height: 320, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false, webPreferences,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(pageUrl(`view=mascot&data=${encodeURIComponent(JSON.stringify(payload))}`));
  win.on('closed', () => {
    if (mascot === win) mascot = null;
  });
  mascot = win;
}

function placeMascot(height) {
  const wa = screen.getPrimaryDisplay().workArea;
  const h = Math.ceil(height) + PAD * 2;
  mascot.setBounds({ x: wa.x + wa.width - MASCOT_W + PAD - MARGIN, y: wa.y + wa.height - h + PAD - MARGIN, width: MASCOT_W, height: h });
  mascot.showInactive();
}

const toastOf = (e) => toasts.find((t) => t.webContents === e.sender) ?? (mascot?.webContents === e.sender ? mascot : undefined);

ipcMain.handle('toast:show', (_e, payload) => (payload.variant === 'nudge' ? createMascot(payload) : createToast(payload)));
ipcMain.on('toast:size', (e, height) => {
  const win = toastOf(e);
  if (!win) return;
  if (win === mascot) return placeMascot(height);
  win.setSize(TOAST_W, Math.ceil(height) + PAD * 2);
  layoutToasts();
  win.showInactive();
});
ipcMain.on('toast:close', (e) => toastOf(e)?.close());
ipcMain.handle('toast:open', (e, { keys, url }) => {
  if (isTrustedUrl(url)) void shell.openExternal(url);
  popup.webContents.send('toast-open', { keys });
  toastOf(e)?.close();
});

ipcMain.handle('toast:action', (e, { action, tab, url }) => {
  if (!['view', 'later', 'stop'].includes(action)) return;
  popup.webContents.send('toast-action', { action, tab });
  // Lembrete de MR parado leva direto ao MR; os demais abrem o painel na aba certa.
  if (action === 'view') (url && isTrustedUrl(url) ? void shell.openExternal(url) : showPopup());
  toastOf(e)?.close();
});

ipcMain.on('popup:hide', () => popup.hide());

ipcMain.on('tray:update', (_e, { rgba, size, tooltip }) => {
  const src = Buffer.from(rgba);
  const bgra = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i += 4) {
    bgra[i] = src[i + 2];
    bgra[i + 1] = src[i + 1];
    bgra[i + 2] = src[i];
    bgra[i + 3] = src[i + 3];
  }
  tray.setImage(nativeImage.createFromBitmap(bgra, { width: size, height: size, scaleFactor: 2 }));
  tray.setToolTip(tooltip);
});

ipcMain.handle('open-external', (_e, url) => {
  if (isTrustedUrl(url)) return shell.openExternal(url);
});

ipcMain.handle('host:allow', (_e, hostname) => {
  if (typeof hostname === 'string' && /^[a-z0-9.-]+$/i.test(hostname)) trustedHosts.add(hostname.toLowerCase());
});

ipcMain.handle('autostart', (_e, on) => app.setLoginItemSettings({ openAtLogin: !!on, args: ['--minimized'] }));

// A webview não alcança o servidor por CORS; as chamadas passam pelo processo principal.
ipcMain.handle('http', async (_e, { url, method = 'GET', headers = {}, body }) => {
  // O servidor interno pode responder em http; qualquer outro destino (ex.: endpoint de IA) exige https.
  if (!isTrustedUrl(url) && new URL(url).protocol !== 'https:') throw new Error('Somente https fora do servidor configurado');
  const res = await net.fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
  return { status: res.status, text: await res.text() };
});

const statePath = path.join(STATE_DIR, 'state.json');
const tokenPath = path.join(STATE_DIR, 'token.bin');

ipcMain.handle('state:load', () => (fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null));
ipcMain.handle('state:save', (_e, json) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(statePath, json);
});

// O token fica cifrado com DPAPI (safeStorage), preso ao usuário do Windows; nunca em texto puro.
ipcMain.handle('token:get', () => {
  if (!fs.existsSync(tokenPath) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(tokenPath));
  } catch {
    return null;
  }
});
ipcMain.handle('token:set', (_e, token) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Cofre do sistema indisponível');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(tokenPath, safeStorage.encryptString(token));
});
ipcMain.handle('token:clear', () => fs.rmSync(tokenPath, { force: true }));

app.whenReady().then(() => {
  createPopup();
  createTray();
  setupUpdater();
});

// Tudo vive na bandeja: fechar janelas não encerra o processo.
app.on('window-all-closed', () => {});
