import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initDesktopBridge } from './desktop';
import './styles.css';

// Markdown'daki <@id> / <#id> chip'leri store'a erişebilsin
(window as any).__concord_store = store;

// Masaüstü (Tauri) penceresindeysek köprüyü kur: harici link, oyun algılama, global kısayol.
// Tarayıcıda no-op.
initDesktopBridge();

// Density + tema + zoom kullanıcı tercihini yükle
document.documentElement.dataset.density = localStorage.getItem('concord_density') ?? 'cozy';
document.documentElement.dataset.theme = localStorage.getItem('concord_theme') ?? 'dark';
const savedZoom = localStorage.getItem('concord_zoom');
if (savedZoom && savedZoom !== '100') (document.documentElement.style as any).zoom = String(parseInt(savedZoom, 10) / 100);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>,
);
