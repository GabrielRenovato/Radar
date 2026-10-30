// Radar — inspirado em uma aplicação da dev Karolyne Martins Rodrigues de Lima.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { Toast } from './features/Toast';
import { Mascot } from './features/Mascot';
import type { ToastPayload } from './types';

const params = new URLSearchParams(window.location.search);

function applyTheme() {
  document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

let root: React.ReactNode;
if (params.get('view') === 'toast') {
  root = <Toast payload={JSON.parse(params.get('data') ?? '{}') as ToastPayload} />;
} else if (params.get('view') === 'mascot') {
  root = <Mascot payload={JSON.parse(params.get('data') ?? '{}')} />;
} else {
  root = <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{root}</React.StrictMode>);
