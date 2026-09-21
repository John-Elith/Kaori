import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { aplicarTemaGuardado } from './tema';
import type { Api } from '../electron/preload';
import { crearApiRemota } from './apiRemota';

declare global {
  interface Window {
    api: Api;
  }
}

// Sin Electron no hay `window.api`: es el teléfono, que usa la misma interfaz
// servida por el PC y habla con él por la red.
if (!window.api) {
  window.kaoriRemoto = true;
  window.api = crearApiRemota();
  document.documentElement.classList.add('remoto');
}

// Antes de montar nada: si la última vez se quedó en oscuro, la ventana debe
// abrir ya en oscuro y no dar un fogonazo blanco mientras React arranca.
aplicarTemaGuardado();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
